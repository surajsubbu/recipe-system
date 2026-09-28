#!/bin/bash
# Backend entrypoint: auto-generate initial migration if none exist, then migrate + start.
set -e

echo "[entrypoint] Checking alembic versions..."
if [ -z "$(find /app/alembic/versions -name '*.py' 2>/dev/null)" ]; then
    echo "[entrypoint] No migration files found — generating initial schema migration..."
    alembic revision --autogenerate -m "initial"
fi

echo "[entrypoint] Running alembic upgrade head..."
alembic upgrade head

echo "[entrypoint] Starting uvicorn..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
