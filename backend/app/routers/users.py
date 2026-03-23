"""
/users  — user management (admin) + current-user self-service.

GET  /users/me           → own profile
GET  /users              → list all users        (admin only)
PUT  /users/{id}/role    → change a user's role  (admin only)
POST /users/invite       → placeholder (send Clerk invite email)
"""
import logging
import os
from typing import List

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user, require_admin
from app.database import get_db
from app.models import User
from app.schemas import UserOut, UserRoleUpdate

logger = logging.getLogger(__name__)

router = APIRouter()


# ─── GET /users/me ────────────────────────────────────────────────────────────

@router.get("/me", response_model=UserOut)
async def get_me(current_user: User = Depends(get_current_user)):
    """Return the authenticated user's own profile."""
    return current_user


# ─── GET /users ───────────────────────────────────────────────────────────────

@router.get("", response_model=List[UserOut])
async def list_users(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """Return all registered users.  Admin only."""
    result = await db.execute(select(User).order_by(User.id))
    return result.scalars().all()


# ─── PUT /users/{id}/role ─────────────────────────────────────────────────────

@router.put("/{user_id}/role", response_model=UserOut)
async def update_user_role(
    user_id: int,
    data: UserRoleUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Change a user's role.  Admin only.  Admins cannot demote themselves."""
    if user_id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admins cannot change their own role",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.role = data.role
    await db.flush()
    return user


# ─── POST /users/invite ───────────────────────────────────────────────────────

@router.post(
    "/invite",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Send a Clerk invitation email (admin only)",
)
async def invite_user(
    email: str,
    _admin: User = Depends(require_admin),
):
    """
    Sends a Clerk invitation via the Backend API.
    Requires CLERK_SECRET_KEY to be set in the environment.
    """
    clerk_secret = os.getenv("CLERK_SECRET_KEY", "")
    if not clerk_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="CLERK_SECRET_KEY not configured",
        )

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                "https://api.clerk.com/v1/invitations",
                headers={
                    "Authorization": f"Bearer {clerk_secret}",
                    "Content-Type": "application/json",
                },
                json={"email_address": email},
            )
        if resp.status_code == 422:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid email or invitation already pending",
            )
        resp.raise_for_status()
        logger.info("Invitation sent to %s", email)
        return {"message": f"Invitation sent to {email}"}

    except httpx.HTTPStatusError as exc:
        logger.error("Clerk invite failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to send invitation. Please try again later.",
        )
