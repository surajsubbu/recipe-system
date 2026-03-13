"""
Alembic async migration environment.
Uses the same DATABASE_URL env var as the FastAPI app.
"""
import asyncio
import os
import sys
from logging.config import fileConfig

# Ensure the project root (/app inside the container, or the backend/ dir locally)
# is on sys.path so that `from app.models import Base` resolves correctly.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from alembic import context
from dotenv import load_dotenv
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

load_dotenv()

# Pull Alembic config object
config = context.config

# Set up Python logging from alembic.ini
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Override sqlalchemy.url from the environment
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://recipeuser:recipepass@localhost:5432/recipes",
)
config.set_main_option("sqlalchemy.url", DATABASE_URL)

# Import metadata so autogenerate can diff against it
from app.models import Base  # noqa: E402

target_metadata = Base.metadata


# ─── Offline mode (generate SQL without connecting) ──────────────────────────

def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


# ─── Online mode (connect and apply) ─────────────────────────────────────────

def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
