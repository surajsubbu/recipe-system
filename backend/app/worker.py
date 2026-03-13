"""
Celery worker + beat entry point.

Worker queues:
  ingest      — recipe ingestion jobs (heavy AI + I/O, 4 concurrent)
  maintenance — scheduled lightweight tasks (cleanup, warm-up)
  celery      — default queue for one-off tasks

Start commands (docker-compose handles these):
  # Worker (handles ingest + maintenance + default)
  celery -A app.worker worker --concurrency=4 --loglevel=info -Q ingest,maintenance,celery

  # Beat scheduler (runs periodic tasks)
  celery -A app.worker beat --loglevel=info

  # Monitoring UI (Flower)
  celery -A app.worker flower --port=5555
"""
import os

from celery import Celery, signals
from celery.schedules import crontab
from dotenv import load_dotenv

load_dotenv()

REDIS_URL: str = os.getenv("REDIS_URL", "redis://redis:6379/0")

# ─── App ──────────────────────────────────────────────────────────────────────

celery_app = Celery(
    "recipe_worker",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=[
        "app.tasks.ingest",       # recipe ingestion pipeline
        "app.tasks.maintenance",  # scheduled warm-up + cleanup
    ],
)

# ─── Configuration ────────────────────────────────────────────────────────────

celery_app.conf.update(
    # Serialisation
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],

    # Time zone
    timezone="UTC",
    enable_utc=True,

    # Reliability
    task_acks_late=True,               # re-queue if worker crashes mid-task
    task_reject_on_worker_lost=True,   # don't lose tasks on OOM / SIGKILL

    # Result storage — keep results for 24 h, then auto-expire from Redis
    result_expires=86_400,             # seconds

    # Concurrency
    worker_concurrency=4,
    worker_prefetch_multiplier=1,      # fair scheduling; ingest tasks are slow

    # Per-task time limits
    # Ingest tasks get overrides below; these are global fallbacks
    task_soft_time_limit=600,          # 10 min — triggers SoftTimeLimitExceeded
    task_time_limit=900,               # 15 min — kills the worker process

    # Logging
    worker_hijack_root_logger=False,
    worker_log_format="[%(asctime)s: %(levelname)s/%(processName)s] %(message)s",

    # Queue routing
    task_default_queue="celery",
    task_queues={
        "ingest":      {"exchange": "ingest",      "routing_key": "ingest"},
        "maintenance": {"exchange": "maintenance", "routing_key": "maintenance"},
        "celery":      {"exchange": "celery",      "routing_key": "celery"},
    },
    task_routes={
        "app.tasks.ingest.*":       {"queue": "ingest"},
        "app.tasks.maintenance.*":  {"queue": "maintenance"},
    },
)

# ─── Per-task overrides ───────────────────────────────────────────────────────
# Ingest jobs can involve Whisper transcription of long videos — give them more time.
celery_app.conf.task_annotations = {
    "app.tasks.ingest.ingest_url_task": {
        "soft_time_limit": 1_200,   # 20 min soft limit
        "time_limit":      1_500,   # 25 min hard limit
        "max_retries":     3,
    }
}

# ─── Celery Beat schedule ─────────────────────────────────────────────────────

celery_app.conf.beat_schedule = {
    # Pre-load Whisper model every 12 h so it's warm when YouTube jobs arrive
    "warm-up-whisper": {
        "task":     "app.tasks.maintenance.warm_up_whisper",
        "schedule": crontab(minute=0, hour="*/12"),
        "options":  {"queue": "maintenance"},
    },
    # Ensure the Ollama model is downloaded daily
    "pull-ollama-model": {
        "task":     "app.tasks.maintenance.pull_ollama_model",
        "schedule": crontab(minute=30, hour=3),   # 03:30 UTC
        "options":  {"queue": "maintenance"},
    },
    # Log system health every 5 minutes (visible in Flower)
    "health-ping": {
        "task":     "app.tasks.maintenance.health_ping",
        "schedule": crontab(minute="*/5"),
        "options":  {"queue": "maintenance"},
    },
}

# ─── Worker signals ───────────────────────────────────────────────────────────

@signals.worker_ready.connect
def on_worker_ready(sender, **kwargs):
    """
    Pre-load the Whisper model when the worker process starts.
    This avoids a cold-start delay on the first YouTube ingestion job.
    We schedule it as a task (fire-and-forget) so the worker becomes
    ready immediately and handles other jobs while the model loads.
    """
    celery_app.send_task(
        "app.tasks.maintenance.warm_up_whisper",
        queue="maintenance",
    )
