"""
Periodic maintenance tasks — scheduled by Celery Beat.

Tasks:
  warm_up_whisper    — pre-load Whisper into process memory
  pull_ollama_model  — ensure the Ollama LLM is downloaded
  health_ping        — emit a log line visible in Flower / monitoring
"""
import logging
import os

from app.worker import celery_app

logger = logging.getLogger(__name__)


# ─── Whisper warm-up ──────────────────────────────────────────────────────────

@celery_app.task(
    name="app.tasks.maintenance.warm_up_whisper",
    queue="maintenance",
    ignore_result=True,
)
def warm_up_whisper() -> None:
    """
    Pre-load the Whisper model into this worker process's memory.

    Whisper takes 5–15 seconds to load the 'small' model the first time.
    Running this at startup and every 12 h ensures YouTube ingestion jobs
    always have a warm model ready.
    """
    try:
        from app.services.whisper_utils import warm_up  # noqa: PLC0415
        warm_up()
        logger.info("[maintenance] Whisper warm-up complete")
    except Exception as exc:
        # Don't let a warm-up failure crash the worker
        logger.warning("[maintenance] Whisper warm-up failed: %s", exc)


# ─── Ollama model pull ────────────────────────────────────────────────────────

@celery_app.task(
    name="app.tasks.maintenance.pull_ollama_model",
    queue="maintenance",
    ignore_result=True,
    soft_time_limit=300,   # 5 min — model downloads can be slow
    time_limit=360,
)
def pull_ollama_model(model: str | None = None) -> None:
    """
    Ensure the configured Ollama model is downloaded.

    Uses OLLAMA_MODEL from .env (default: llama3.2:7b).
    Safe to run repeatedly — Ollama skips the download if already present.
    """
    from app.services.ollama import is_available, pull_model  # noqa: PLC0415

    target = model or os.getenv("OLLAMA_MODEL", "llama3.2:7b")

    if not is_available():
        logger.warning(
            "[maintenance] Ollama not reachable — skipping model pull for '%s'", target
        )
        return

    logger.info("[maintenance] Pulling Ollama model '%s' …", target)
    success = pull_model(target)

    if success:
        logger.info("[maintenance] Ollama model '%s' ready", target)
    else:
        logger.error("[maintenance] Failed to pull Ollama model '%s'", target)


# ─── Health ping ──────────────────────────────────────────────────────────────

@celery_app.task(
    name="app.tasks.maintenance.health_ping",
    queue="maintenance",
    ignore_result=True,
)
def health_ping() -> None:
    """
    Emit a periodic log line so Flower / log aggregators can verify
    the beat scheduler and workers are alive.
    """
    from app.services.whisper_utils import is_loaded  # noqa: PLC0415
    from app.services.ollama import is_available      # noqa: PLC0415

    whisper_status = "warm" if is_loaded() else "cold"
    ollama_status  = "up"   if is_available() else "down"

    logger.info(
        "[maintenance] health_ping  whisper=%s  ollama=%s",
        whisper_status,
        ollama_status,
    )
