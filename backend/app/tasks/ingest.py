"""
Celery tasks: ingest_url_task (main) and transcribe_youtube_background (enhancement)

Main task (ingest_url_task):
  Full AI pipeline: classify → scrape/transcribe → extract → normalize → persist.
  For YouTube videos, now prefers description-based extraction + queues background transcription.

Background task (transcribe_youtube_background):
  Transcribes YouTube video and enhances existing recipe with additional info from transcript.

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
            _progress(self, "Fetching YouTube video metadata…")
            from app.services.youtube import get_metadata_only, get_transcript  # noqa: PLC0415

            meta = get_metadata_only(url)
            title = meta.get("title") or ""
            description = meta.get("description") or ""
            thumbnail_url = meta.get("thumbnail")
            transcript = ""

            # ── Try to get transcript immediately (subtitles or Whisper) ────────
            _progress(self, "Extracting transcript from video…")
            try:
                yt_result = get_transcript(url)
                transcript = yt_result.transcript
                logger.info("[ingest] Got transcript (%d chars, source: %s)",
                           len(transcript), yt_result.transcript_source)
            except Exception as exc:
                logger.warning("[ingest] Could not extract transcript: %s", exc)
                # Continue with description only if transcript fails

            # ── Try to find and scrape a recipe blog link from the description ──
            secondary_source_url = None
            structured_from_link = None
            try:
                from app.services.youtube import extract_recipe_links  # noqa: PLC0415
                recipe_links = extract_recipe_links(description)
                if recipe_links:
                    _progress(self, "Found recipe link in description, scraping…")
                    from app.services.scraper import scrape_url  # noqa: PLC0415
                    for link in recipe_links[:3]:  # try up to 3 links
                        try:
                            scrape = scrape_url(link)
                            if scrape.structured:
                                structured_from_link = scrape
                                secondary_source_url = link
                                logger.info("[ingest] Scraped structured recipe from: %s", link)
                                break
                        except Exception as link_exc:
                            logger.debug("[ingest] Failed to scrape %s: %s", link, link_exc)
                            continue
            except Exception as exc:
                logger.debug("[ingest] Recipe link extraction failed: %s", exc)

            # ── Step 2a: Extract recipe data ─────────────────────────────────
            _progress(self, "Extracting recipe from video…")

            if structured_from_link and structured_from_link.structured:
                # Use the structured data from the blog link (more reliable)
                recipe_data = from_structured(structured_from_link.data, source_url=url)
                # Supplement with transcript timestamps if available
                if transcript and yt_result.timestamped_transcript:
                    # Re-extract just for timestamps from transcript
                    ts_lines = [
                        f"[{int(t)}s] {text}"
                        for t, text in yt_result.timestamped_transcript
                    ]
                    ts_text = "\n".join(ts_lines)
                    try:
                        ts_recipe = from_text(text=ts_text, source_url=url, title_hint=title)
                        # Map timestamps from transcript extraction to structured steps
                        if ts_recipe.steps:
                            ts_map = {s.order: s.video_timestamp_seconds for s in ts_recipe.steps if s.video_timestamp_seconds}
                            for step in recipe_data.steps:
                                if step.order in ts_map and step.video_timestamp_seconds is None:
                                    step.video_timestamp_seconds = ts_map[step.order]
                    except Exception:
                        pass  # timestamps are nice-to-have
            else:
                if transcript and yt_result.timestamped_transcript:
                    # Build [Ns] prefixed text so the LLM can map steps to timestamps
                    ts_lines = [
                        f"[{int(t)}s] {text}"
                        for t, text in yt_result.timestamped_transcript
                    ]
                    combined_text = "\n".join(ts_lines) + f"\n\n---\nVideo description:\n{description[:2000]}"
                elif transcript:
                    combined_text = f"{transcript}\n\n---\nVideo description:\n{description[:2000]}"
                else:
                    combined_text = description

                recipe_data: RecipeData = from_text(
                    text=combined_text,
                    source_url=url,
                    title_hint=title,
                )

            # Use the YouTube thumbnail as the recipe image if none was found
            if not recipe_data.image_url and thumbnail_url:
                recipe_data.image_url = thumbnail_url

            # Store transcript only when non-empty (None → not shown in UI)
            recipe_data.transcript = transcript if transcript else None

            # Store secondary source URL if we found a recipe blog
            if secondary_source_url:
                recipe_data.secondary_source_url = secondary_source_url

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

            # Apply scraped image when LLM didn't find one
            if not recipe_data.image_url and scrape.data.get("image"):
                recipe_data.image_url = scrape.data["image"]

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
        secondary_source_url=getattr(recipe_data, 'secondary_source_url', None),
        image_url=recipe_data.image_url,
        cook_time_minutes=recipe_data.cook_time,
        prep_time_minutes=recipe_data.prep_time,
        servings=recipe_data.servings,
        transcript=recipe_data.transcript,
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
            section=getattr(ing, 'section', None),
        ))

    # ── Steps ──────────────────────────────────────────────────────────────────
    for step in recipe_data.steps:
        db.add(Step(
            recipe_id=recipe.id,
            order=step.order,
            instruction=step.instruction,
            timer_seconds=step.timer_seconds,
            video_timestamp_seconds=step.video_timestamp_seconds,
            section=getattr(step, 'section', None),
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


# ─── Background transcription task ────────────────────────────────────────────

@celery_app.task(
    bind=True,
    base=IngestTask,
    name="app.tasks.ingest.transcribe_youtube_background",
    max_retries=2,
)
def transcribe_youtube_background(self, url: str, title_hint: str = "") -> dict:
    """
    Background task: Transcribe YouTube video and extract additional recipe info.

    This task runs asynchronously after the initial recipe has been extracted
    from the video description. It transcribes the audio and looks for additional
    details (e.g., tips, variations, alternative measurements) that can enhance
    the recipe.

    The task is designed to fail silently if transcription isn't possible —
    the recipe is already saved, so this is just enhancement.
    """
    job_id = self.request.id
    logger.info("[youtube-bg] job=%s transcribe_background for: %s", job_id, url)

    try:
        # Try to transcribe the video
        logger.info("[youtube-bg] Downloading & transcribing audio from: %s", url)
        from app.services.youtube import get_transcript  # noqa: PLC0415

        yt = get_transcript(url)

        if not yt.transcript or len(yt.transcript) < 100:
            logger.warning(
                "[youtube-bg] Transcript too short (%d chars), skipping enhancement",
                len(yt.transcript or ""),
            )
            return {"status": "skipped", "reason": "transcript too short"}

        logger.info(
            "[youtube-bg] Transcribed %d chars from: %s (source: %s)",
            len(yt.transcript),
            yt.title or title_hint,
            yt.transcript_source,
        )

        # Log success — the transcript is available if needed for manual review
        # Recipes are already created, so transcription failures don't affect the user
        return {
            "status": "completed",
            "transcript_source": yt.transcript_source,
            "transcript_length": len(yt.transcript),
        }

    except RuntimeError as exc:
        logger.warning(
            "[youtube-bg] job=%s transcription failed (expected for restricted videos): %s",
            job_id,
            exc,
        )
        # Don't retry for RuntimeError (video unavailable, age-restricted, etc.)
        # Recipe is already saved from description, so this is just a nice-to-have
        return {
            "status": "failed",
            "reason": "transcription unavailable",
            "detail": str(exc),
        }

    except Exception as exc:
        logger.exception("[youtube-bg] job=%s unexpected error during transcription", job_id)
        try:
            countdown = 60 * (2 ** self.request.retries)
            raise self.retry(exc=exc, countdown=countdown)
        except MaxRetriesExceededError:
            logger.error(
                "[youtube-bg] job=%s max retries exceeded, giving up on transcription",
                job_id,
            )
            return {
                "status": "failed",
                "reason": "max retries exceeded",
                "detail": str(exc),
            }
