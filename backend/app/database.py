"""
Async SQLAlchemy engine + session factory  (FastAPI / async code).
Sync engine + session factory              (Celery workers).

FastAPI uses `get_db` as a dependency (async).
Celery tasks import `SyncSessionLocal` directly (sync / psycopg2).
"""
import os
from typing import AsyncGenerator

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

load_dotenv()

DATABASE_URL: str = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://recipeuser:recipepass@localhost:5432/recipes",
)

# Synchronous URL for Celery (asyncpg → psycopg2)
SYNC_DATABASE_URL: str = DATABASE_URL.replace(
    "postgresql+asyncpg://", "postgresql+psycopg2://"
)

# NullPool is recommended for short-lived async connections (Celery + FastAPI
# share the same models but run in separate processes).
engine = create_async_engine(
    DATABASE_URL,
    echo=bool(os.getenv("SQL_ECHO", "")),
    poolclass=NullPool,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency — yields a transactional AsyncSession."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


# ─── Sync engine (Celery workers) ─────────────────────────────────────────────

_sync_engine = create_engine(
    SYNC_DATABASE_URL,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
)

SyncSessionLocal: sessionmaker[Session] = sessionmaker(
    bind=_sync_engine,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
)
