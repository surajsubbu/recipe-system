"""
/webhook  — external trigger endpoints.

POST /webhook/homeassistant  → triggered by Home Assistant automations.
                               Extend the handler to run meal-plan lookups,
                               read shopping lists via voice, etc.
"""
import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status

from app.schemas import HAWebhookPayload

logger = logging.getLogger(__name__)

router = APIRouter()

# Shared secret set in .env to prevent unauthenticated triggers
import os
_HA_SECRET = os.getenv("HA_WEBHOOK_SECRET", "")


def _verify_ha_secret(request: Request) -> None:
    """Simple bearer-token guard for the Home Assistant webhook."""
    if not _HA_SECRET:
        # Secret not configured — open endpoint (dev only, log a warning)
        logger.warning("HA_WEBHOOK_SECRET is not set — webhook is unprotected")
        return
    auth = request.headers.get("Authorization", "")
    if auth != f"Bearer {_HA_SECRET}":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid webhook secret",
        )


def _handle_ha_event(event: str, data: dict) -> None:
    """Background handler — extend with real HA logic in future steps."""
    logger.info("Home Assistant event received: %s  data=%s", event, data)
    # TODO (future): react to events, e.g. start a shopping list read-out


@router.post(
    "/homeassistant",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Home Assistant automation trigger",
)
async def homeassistant_webhook(
    payload: HAWebhookPayload,
    background_tasks: BackgroundTasks,
    request: Request,
):
    """
    Accepts a JSON body: { "event": "...", "data": {...} }
    Protected by the HA_WEBHOOK_SECRET env var (Bearer token).
    Processing is deferred to a background task so HA gets a fast 202.
    """
    _verify_ha_secret(request)
    background_tasks.add_task(
        _handle_ha_event, payload.event, payload.data or {}
    )
    return {"accepted": True, "event": payload.event}
