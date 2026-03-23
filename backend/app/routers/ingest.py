"""
/ingest  — queue a URL (web recipe or YouTube) for AI extraction.

POST /ingest         { url }  → 202 + { job_id, status: "pending" }
GET  /ingest/{job_id}         → { job_id, status, recipe_id?, error? }

The actual extraction work is done by the Celery task defined in
app/tasks/ingest.py (implemented in Step 3/4).  This router just enqueues
the task and polls Celery's result backend (Redis) for status.
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import User
from app.schemas import IngestJobOut, IngestRequest

logger = logging.getLogger(__name__)

router = APIRouter()

# Celery task states → our API status vocabulary
_STATE_MAP = {
    "PENDING":  "pending",
    "RECEIVED": "pending",
    "STARTED":  "running",
    "RETRY":    "running",
    "SUCCESS":  "done",
    "FAILURE":  "failed",
    "REVOKED":  "failed",
}


# ─── POST /ingest ─────────────────────────────────────────────────────────────

@router.post(
    "",
    response_model=IngestJobOut,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Enqueue a URL for AI recipe extraction",
)
async def start_ingest(
    data: IngestRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Accepts any web URL or YouTube link.
    Returns a job_id for polling.  The AI pipeline runs asynchronously.
    """
    try:
        # Lazy import so the module loads even before Step 3 tasks exist
        from app.tasks.ingest import ingest_url_task  # noqa: PLC0415

        task = ingest_url_task.delay(data.url, current_user.id)
        logger.info("Enqueued ingest job %s for user %d url=%s", task.id, current_user.id, data.url)
        return IngestJobOut(job_id=task.id, status="pending")

    except ImportError:
        # Tasks module not yet implemented (Step 3) — return a clear error
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Ingestion pipeline not yet available (Step 3).",
        )
    except Exception as exc:
        logger.exception("Failed to enqueue ingest job")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to enqueue job. Please try again.",
        )


# ─── GET /ingest/{job_id} ─────────────────────────────────────────────────────

@router.get(
    "/{job_id}",
    response_model=IngestJobOut,
    summary="Poll an ingestion job for status and result",
)
async def get_ingest_status(
    job_id: str,
    current_user: User = Depends(get_current_user),
):
    """
    Returns:
      status=pending   — queued but not started
      status=running   — actively being processed
      status=done      — finished; recipe_id is set
      status=failed    — something went wrong; error message is set
    """
    try:
        from app.worker import celery_app  # noqa: PLC0415

        async_result = celery_app.AsyncResult(job_id)
        celery_state: str = async_result.state  # always a string

        api_status = _STATE_MAP.get(celery_state, celery_state.lower())

        if celery_state == "SUCCESS":
            result_data = async_result.result or {}
            return IngestJobOut(
                job_id=job_id,
                status="done",
                recipe_id=result_data.get("recipe_id"),
            )

        if celery_state == "FAILURE":
            error_msg = str(async_result.result) if async_result.result else "Unknown error"
            return IngestJobOut(job_id=job_id, status="failed", error=error_msg)

        # PENDING / STARTED / RETRY / etc.
        # For STARTED state, Celery stores progress in async_result.info
        progress: Optional[str] = None
        if celery_state in ("STARTED", "RETRY"):
            info = async_result.info or {}
            if isinstance(info, dict):
                progress = info.get("progress")
        return IngestJobOut(job_id=job_id, status=api_status, progress=progress)

    except Exception as exc:
        logger.exception("Error fetching job status for %s", job_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not retrieve job status. Please try again.",
        )
