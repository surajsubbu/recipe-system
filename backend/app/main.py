"""
FastAPI application entry point.
All routers are registered here with their URL prefixes and OpenAPI tags.
"""
import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

app = FastAPI(
    title="Recipe Management API",
    version="1.0.0",
    description="Self-hosted AI recipe management system",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ─── CORS ─────────────────────────────────────────────────────────────────────

_origins = [
    o.strip()
    for o in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Routers ──────────────────────────────────────────────────────────────────

from app.routers import collections, health, ingest, mealplan, pantry, recipes, shopping, users, webhooks  # noqa: E402

app.include_router(health.router, tags=["health"])

app.include_router(
    recipes.router,
    prefix="/recipes",
    tags=["recipes"],
)
app.include_router(
    ingest.router,
    prefix="/ingest",
    tags=["ingest"],
)
app.include_router(
    shopping.router,
    prefix="/shopping-list",
    tags=["shopping"],
)
app.include_router(
    mealplan.router,
    prefix="/meal-plan",
    tags=["meal-plan"],
)
app.include_router(
    users.router,
    prefix="/users",
    tags=["users"],
)
app.include_router(
    webhooks.router,
    prefix="/webhook",
    tags=["webhooks"],
)
app.include_router(
    collections.router,
    prefix="/collections",
    tags=["collections"],
)
app.include_router(
    pantry.router,
    prefix="/pantry",
    tags=["pantry"],
)
