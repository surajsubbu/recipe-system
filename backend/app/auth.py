"""
Clerk JWT verification middleware and FastAPI dependencies.

Flow:
  1. Client sends `Authorization: Bearer <clerk_session_token>`
  2. We fetch Clerk's JWKS (RS256 public keys) and cache them in-process.
  3. python-jose verifies the token signature and expiry.
  4. `get_current_user` resolves (or creates) the local User row from clerk_id.

JWKS are cached for JWKS_CACHE_TTL seconds; cache is invalidated on key-miss
so rolling Clerk key rotations are handled transparently.
"""
import os
import time
from typing import Optional

import httpx
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import User, UserRole

load_dotenv()

CLERK_JWKS_URL: str = os.getenv(
    "CLERK_JWKS_URL",
    "https://REPLACE_ME.clerk.accounts.dev/.well-known/jwks.json",
)
JWKS_CACHE_TTL: int = int(os.getenv("JWKS_CACHE_TTL", "3600"))  # 1 hour

security = HTTPBearer(auto_error=False)

# ─── In-process JWKS cache ────────────────────────────────────────────────────

_jwks_cache: Optional[dict] = None
_jwks_fetched_at: float = 0.0


async def _fetch_jwks(force: bool = False) -> dict:
    """Return cached JWKS or fetch fresh ones from Clerk."""
    global _jwks_cache, _jwks_fetched_at
    now = time.monotonic()
    if not force and _jwks_cache and (now - _jwks_fetched_at) < JWKS_CACHE_TTL:
        return _jwks_cache
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(CLERK_JWKS_URL)
        resp.raise_for_status()
    _jwks_cache = resp.json()
    _jwks_fetched_at = now
    return _jwks_cache


def _find_key(jwks: dict, kid: str) -> Optional[dict]:
    for key in jwks.get("keys", []):
        if key.get("kid") == kid:
            return key
    return None


# ─── Token verification ───────────────────────────────────────────────────────

async def verify_token(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> dict:
    """
    Dependency: verify a Clerk JWT and return its decoded payload.
    Raises 401 on any failure.
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials

    try:
        header = jwt.get_unverified_header(token)
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid token header: {exc}"
        )

    kid = header.get("kid", "")
    jwks = await _fetch_jwks()
    key = _find_key(jwks, kid)

    # Key not in cache — could be a newly rotated key; try once more.
    if key is None:
        jwks = await _fetch_jwks(force=True)
        key = _find_key(jwks, kid)

    if key is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Public key not found for token kid",
        )

    try:
        payload: dict = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            options={"verify_aud": False},  # Clerk tokens don't always set aud
        )
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Token validation failed: {exc}",
        )

    return payload


# ─── User resolution ──────────────────────────────────────────────────────────

async def get_current_user(
    payload: dict = Depends(verify_token),
    db: AsyncSession = Depends(get_db),
) -> User:
    """
    Dependency: resolve the JWT payload to a local User row.
    Creates the User on first login (upsert by clerk_id).
    """
    clerk_id: Optional[str] = payload.get("sub")
    if not clerk_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing 'sub' claim",
        )

    result = await db.execute(select(User).where(User.clerk_id == clerk_id))
    user = result.scalar_one_or_none()

    if user is None:
        # Auto-provision the user from Clerk metadata
        email: str = (
            payload.get("email")
            or payload.get("primary_email_address_id", "")
            or f"{clerk_id}@noemail.local"
        )
        user = User(clerk_id=clerk_id, email=email, role=UserRole.user)
        db.add(user)
        await db.flush()  # get the generated id without committing

    return user


async def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Dependency: ensure the authenticated user has the admin role."""
    if current_user.role != UserRole.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )
    return current_user
