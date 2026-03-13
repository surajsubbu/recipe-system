"""
Health check endpoints.

GET /health          → lightweight liveness probe (used by Docker + Cloudflare)
GET /health/detailed → full system status (DB, Redis, Celery, Ollama, Whisper)

The liveness probe must always return 200 as fast as possible.
The detailed check is intended for dashboards / ops tooling.
"""
import logging
import os
import time
from typing import Any

from fastapi import APIRouter

logger = logging.getLogger(__name__)

router = APIRouter()


# ─── Liveness probe (Docker healthcheck, Cloudflare, load-balancer) ───────────

@router.get("/health", summary="Liveness probe")
async def health_check():
    """Always returns 200 while the process is running."""
    return {"status": "healthy", "service": "recipe-api"}


# ─── Detailed system health ───────────────────────────────────────────────────

@router.get("/health/detailed", summary="Full system health report")
async def detailed_health():
    """
    Check every dependency and return a status dict.
    Always returns HTTP 200 — callers should read the individual `status` fields.
    """
    results: dict[str, Any] = {
        "service":  "recipe-api",
        "overall":  "healthy",
        "checks":   {},
    }

    checks = results["checks"]

    # ── PostgreSQL ────────────────────────────────────────────────────────────
    checks["postgres"] = await _check_postgres()

    # ── Redis ─────────────────────────────────────────────────────────────────
    checks["redis"] = _check_redis()

    # ── Celery workers ────────────────────────────────────────────────────────
    checks["celery"] = _check_celery()

    # ── Ollama ────────────────────────────────────────────────────────────────
    checks["ollama"] = _check_ollama()

    # ── Whisper model ─────────────────────────────────────────────────────────
    checks["whisper"] = _check_whisper()

    # ── Overall status ────────────────────────────────────────────────────────
    # Degrade to "degraded" if any non-critical service is down;
    # only postgres + redis failures make the API "unhealthy".
    critical_ok = (
        checks["postgres"]["status"] == "ok"
        and checks["redis"]["status"] == "ok"
    )
    all_ok = all(c["status"] == "ok" for c in checks.values())

    if not critical_ok:
        results["overall"] = "unhealthy"
    elif not all_ok:
        results["overall"] = "degraded"

    return results


# ─── Individual checks ────────────────────────────────────────────────────────

async def _check_postgres() -> dict:
    t0 = time.monotonic()
    try:
        from sqlalchemy import text                        # noqa: PLC0415
        from app.database import AsyncSessionLocal         # noqa: PLC0415
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
        return {"status": "ok", "latency_ms": _ms(t0)}
    except Exception as exc:
        logger.warning("[health] PostgreSQL check failed: %s", exc)
        return {"status": "error", "error": str(exc), "latency_ms": _ms(t0)}


def _check_redis() -> dict:
    t0 = time.monotonic()
    try:
        import redis as redis_sync                          # noqa: PLC0415
        r = redis_sync.Redis.from_url(
            os.getenv("REDIS_URL", "redis://redis:6379/0"),
            socket_timeout=3,
        )
        r.ping()
        return {"status": "ok", "latency_ms": _ms(t0)}
    except Exception as exc:
        logger.warning("[health] Redis check failed: %s", exc)
        return {"status": "error", "error": str(exc), "latency_ms": _ms(t0)}


def _check_celery() -> dict:
    t0 = time.monotonic()
    try:
        from app.worker import celery_app                  # noqa: PLC0415
        inspect = celery_app.control.inspect(timeout=3)
        active = inspect.active()
        if active is None:
            return {"status": "degraded", "detail": "No workers responded", "latency_ms": _ms(t0)}
        worker_count = len(active)
        return {"status": "ok", "workers": worker_count, "latency_ms": _ms(t0)}
    except Exception as exc:
        logger.warning("[health] Celery check failed: %s", exc)
        return {"status": "degraded", "error": str(exc), "latency_ms": _ms(t0)}


def _check_ollama() -> dict:
    t0 = time.monotonic()
    try:
        from app.services.ollama import is_available, list_models  # noqa: PLC0415
        if not is_available():
            return {"status": "degraded", "detail": "Ollama unreachable", "latency_ms": _ms(t0)}
        models = list_models()
        return {"status": "ok", "models": models, "latency_ms": _ms(t0)}
    except Exception as exc:
        return {"status": "degraded", "error": str(exc), "latency_ms": _ms(t0)}


def _check_whisper() -> dict:
    t0 = time.monotonic()
    try:
        from app.services.whisper_utils import is_loaded, model_size  # noqa: PLC0415
        return {
            "status":     "ok",
            "model":      model_size(),
            "loaded":     is_loaded(),
            "latency_ms": _ms(t0),
        }
    except Exception as exc:
        return {"status": "degraded", "error": str(exc), "latency_ms": _ms(t0)}


def _ms(t0: float) -> int:
    return int((time.monotonic() - t0) * 1000)
