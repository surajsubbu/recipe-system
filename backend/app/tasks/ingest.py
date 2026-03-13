"""
Celery task: ingest_url_task
Full AI pipeline: classify → scrape/transcribe → extract → normalize → persist.

The task is designed to be resilient:
  - Progress states are emitted so the frontend can show live status.
  - Each expensive step has its own exception handling.
  - On failure the task retries up to 3 times with exponential back-off.
  - The DB session is opened once per task execution and always closed.

Returns:
    { "recipe_id": <int> }   on success
Raises:
    Exception (after retries exhausted) — Celery marks task as FAILURE.
"""
import logging
from typing import Optional

from celery import Task
from celery.exceptions import MaxRetriesExceededError
from sqlalchemy.orm import Session

from app.worker import celery_app

logger = logging.getLogger(__name__)


# ─── Task base class ──────────────────────────────────────────────────────────

class IngestTask(Task):
    """
    Lazy-initialise a sync DB session per worker process.
    The session is closed in after_return() to prevent connection leaks.
    """
    abstract = True
    _db: Optional[Session] = None

    @property
    def db(self) -> Session:
        if self._db is None:
            from app.database import SyncSessionLocal  # noqa: PLC0415
            self._db = SyncSessionLocal()
        return self._db

    def after_return(self, status, retval, task_id, args, kwargs, einfo):
        if self._db is not None:
            self._db.close()
            self._db = None


# ─── Task ─────────────────────────────────────────────────────────────────────

@celery_app.task(
    bind=True,
    base=IngestTask,
    name="app.tasks.ingest.ingest_url_task",
    max_retries=3,
)
def ingest_url_task(self, url: str, user_id: int) -> dict:
    """
    Full recipe ingestion pipeline.

    Steps:
      1. Classify URL (web recipe vs YouTube)
      2a. Web recipe: scrape with recipe-scrapers, fall back to BeautifulSoup
      2b. YouTube: download audio with yt-dlp, transcribe with Whisper
      3. Extract structured RecipeData (fast model for structured scrapes;
                                        smart model for unstructured text)
      4. Normalize ingredient names + assign grocery categories (balanced model)
      5. Persist Recipe, Ingredients, Steps, Tags to PostgreSQL
    """
    job_id = self.request.id
    attempt = self.request.retries + 1
    logger.info("[ingest] job=%s  attempt=%d  url=%s  user_id=%d",
                job_id, attempt, url, user_id)

    try:
        # ── Step 1: Classify URL ──────────────────────────────────────────────
        _progress(self, "Classifying URL…")
        from app.agents.router_agent import URLType, classify_url  # noqa: PLC0415

        url_type = classify_url(url)
        logger.info("[ingest] URL type: %s", url_type)

        if url_type == URLType.unknown:
            raise ValueError(f"Unsupported or malformed URL: {url!r}")

        # ── Step 2 + 3: Scrape / transcribe → extract ─────────────────────────
        from app.agents.extractor_agent import RecipeData  # noqa: PLC0415
        from app.agents.extractor_agent import from_structured, from_text

        if url_type == URLType.youtube:
            _progress(self, "Downloading & transcribing YouTube audio…")
            from app.services.youtube import get_transcript  # noqa: PLC0415

            yt = get_transcript(url)

            _progress(self, "Extracting recipe from transcript…")
            recipe_data: RecipeData = from_text(
                text=yt.transcript,
                source_url=url,
                title_hint=yt.title,
            )
            # Use the YouTube thumbnail as the recipe image if none was found
            if not recipe_data.image_url and yt.thumbnail_url:
                recipe_data.image_url = yt.thumbnail_url

        else:  # web_recipe
            _progress(self, "Scraping recipe page…")
            from app.services.scraper import scrape_url  # noqa: PLC0415

            scrape = scrape_url(url)

            if scrape.structured:
                _progress(self, "Parsing structured recipe data…")
                recipe_data = from_structured(scrape.data, source_url=url)
            else:
                _progress(self, "Extracting recipe with AI…")
                recipe_data = from_text(
                    text=scrape.data.get("raw_text", ""),
                    source_url=url,
                    title_hint=scrape.data.get("title", ""),
                )

        logger.info(
            "[ingest] Extracted: %r — %d ingredients, %d steps, %d tags",
            recipe_data.title,
            len(recipe_data.ingredients),
            len(recipe_data.steps),
            len(recipe_data.tags),
        )

        # ── Step 4: Normalize ingredients ─────────────────────────────────────
        _progress(self, "Normalizing ingredients…")
        from app.agents.normalizer_agent import normalize_ingredients  # noqa: PLC0415

        ingredient_names = [ing.name for ing in recipe_data.ingredients]
        norm_map = {
            r.original_name: r
            for r in normalize_ingredients(ingredient_names)
        }

        # ── Step 5: Persist to database ────────────────────────────────────────
        _progress(self, "Saving recipe to database…")
        recipe_id = _save_recipe(self.db, recipe_data, norm_map, user_id)

        logger.info("[ingest] Done — recipe_id=%d", recipe_id)
        return {"recipe_id": recipe_id}

    except Exception as exc:
        logger.exception("[ingest] job=%s failed (attempt %d): %s", job_id, attempt, exc)
        try:
            # Exponential back-off: 30s, 60s, 120s
            countdown = 30 * (2 ** self.request.retries)
            raise self.retry(exc=exc, countdown=countdown)
        except MaxRetriesExceededError:
            logger.error("[ingest] job=%s — max retries exceeded", job_id)
            raise exc


# ─── Progress helper ──────────────────────────────────────────────────────────

def _progress(task: Task, message: str) -> None:
    """Update Celery task state with a human-readable progress message."""
    task.update_state(state="STARTED", meta={"progress": message})
    logger.info("[ingest] %s", message)


# ─── Database persistence ─────────────────────────────────────────────────────

def _save_recipe(
    db: Session,
    recipe_data,
    norm_map: dict,
    user_id: int,
) -> int:
    """
    Write RecipeData to the database inside a single transaction.
    Returns the new recipe's integer ID.
    """
    from app.models import Ingredient, Recipe, Step, Tag  # noqa: PLC0415

    # ── Recipe row ─────────────────────────────────────────────────────────────
    recipe = Recipe(
        title=recipe_data.title,
        description=recipe_data.description,
        source_url=recipe_data.source_url,
        image_url=recipe_data.image_url,
        cook_time_minutes=recipe_data.cook_time,
        prep_time_minutes=recipe_data.prep_time,
        servings=recipe_data.servings,
        owner_id=user_id,
    )
    db.add(recipe)
    db.flush()  # populate recipe.id before adding children

    # ── Ingredients ────────────────────────────────────────────────────────────
    for ing in recipe_data.ingredients:
        norm = norm_map.get(ing.name)
        db.add(Ingredient(
            recipe_id=recipe.id,
            name=ing.name,
            amount=ing.amount,
            unit=ing.unit,
            normalized_name=(
                norm.normalized_name if norm else ing.name.lower().strip()
            ),
            category=(
                norm.category if norm else "other"
            ),
        ))

    # ── Steps ──────────────────────────────────────────────────────────────────
    for step in recipe_data.steps:
        db.add(Step(
            recipe_id=recipe.id,
            order=step.order,
            instruction=step.instruction,
            timer_seconds=step.timer_seconds,
        ))

    # ── Tags (get-or-create) ───────────────────────────────────────────────────
    for raw_tag in recipe_data.tags:
        tag_name = raw_tag.strip().lower()
        if not tag_name:
            continue
        tag = db.query(Tag).filter(Tag.name == tag_name).first()
        if not tag:
            tag = Tag(name=tag_name)
            db.add(tag)
            db.flush()
        recipe.tags.append(tag)

    db.commit()
    logger.info("[ingest] Recipe id=%d committed to DB", recipe.id)
    return recipe.id
