# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Start Commands

All services run via Docker Compose. The project uses volume mounts for both backend and frontend, so code changes hot-reload without rebuilding.

```bash
# Start all 11 services (postgres, redis, backend, celery, frontend, etc.)
docker compose up -d

# Watch backend API logs with auto-reload
docker compose logs -f backend

# Stop all services (data volumes persist)
docker compose down

# Run database migrations (happens automatically on backend startup)
docker compose exec backend alembic upgrade head

# Create a new migration after changing models.py
docker compose exec backend alembic revision --autogenerate -m "your migration message"
```

## Frontend Development (Next.js)

```bash
# Logs and hot-reload
docker compose logs -f frontend

# Install a new package (rebuilds node_modules volume)
docker compose exec frontend npm install <package-name>
docker compose restart frontend
```

## Backend Development (FastAPI)

```bash
# Run a Python command in the backend container
docker compose exec backend python -c "from app.models import *; print('ok')"

# Restart after code changes (Watchfiles does this automatically)
docker compose restart backend
```

## Celery Task Development

```bash
# Monitor tasks in real-time
open http://localhost:5555  # Flower UI (password: flowerpass by default)

# Manually trigger an ingest task
docker compose exec backend python -c "
from app.tasks.ingest import ingest_url_task
result = ingest_url_task.delay('https://www.allrecipes.com/recipe/10813/', 1)
print('Job ID:', result.id)
"

# Check task logs
docker compose logs -f celery_worker
```

## Key Ports

| Service | Port | URL |
|---------|------|-----|
| Frontend | 3001 | http://localhost:3001 |
| Backend API | 8001 | http://localhost:8001/docs (Swagger) |
| Backend API | 8001 | http://localhost:8001/redoc (ReDoc) |
| Flower (task UI) | 5555 | http://localhost:5555 |
| Redis | 6380 | (internal: redis://redis:6379) |
| PostgreSQL | 5433 | (internal: postgres:5432) |

*Note: Host ports are mapped to avoid conflicts with local services. See `docker-compose.yml` header for port mapping.*

## Architecture

The recipe system is a full-stack app with AI-powered recipe ingestion:

```
┌──────────────────────────────────────────────────────────────┐
│  Frontend (Next.js 14 + TypeScript)                          │
│  - Clerk auth (passwordless, SSO)                            │
│  - PWA (installable, offline with Service Worker)            │
│  - Tailwind CSS with dark mode                               │
│  └─ Pages: recipes list, add recipe, cook mode, meal plan   │
└──────────────────┬───────────────────────────────────────────┘
                   │ JWT auth
                   ▼
┌──────────────────────────────────────────────────────────────┐
│  Backend (FastAPI)                                           │
│  - Routers: recipes, ingest, shopping-list, meal-plan, users │
│  - SQLAlchemy ORM (async) + Pydantic v2 validation          │
│  - Alembic migrations (auto-generated)                       │
│  - Clerk JWT verification + user provisioning               │
└──────────────────┬───────────────────────────────────────────┘
                   │
        ┌──────────┼──────────┐
        ▼          ▼          ▼
     ┌─────────────────────────────────────────────────────────┐
     │  AI Agents (OpenRouter API)                              │
     │  - router_agent.py: URL type classification             │
     │  - extractor_agent.py: Recipe extraction (text/HTML)    │
     │  - normalizer_agent.py: Ingredient normalization        │
     │  └─ Models: Fast (ingredient parse), Smart (extraction) │
     └────────────┬──────────────────────────────────────────┘
                  │
     ┌────────────┴──────────┐
     ▼                       ▼
┌─────────────────────────────────────────┐
│  Celery Task Queue                       │
│  - ingest queue: URL/YouTube ingestion   │
│  - maintenance queue: warmup, health     │
│  - Worker concurrency: 4                 │
│  - Celery Beat: periodic scheduled jobs  │
└─────────────────────────────────────────┘
     │
┌────┴────┬──────────────┐
▼         ▼              ▼
Services:
- YouTube (yt-dlp + Whisper speech-to-text for captions)
- Recipe scraping (recipe-scrapers library + BeautifulSoup4 fallback)
- Ollama (optional local LLM)
```

**Data flow for recipe ingestion:**

1. User submits URL/YouTube link via frontend
2. Backend creates ingest job → returns job ID
3. Job queued to Celery ingest queue
4. Celery worker retrieves content:
   - For URLs: use recipe-scrapers or BeautifulSoup4
   - For YouTube: download captions with yt-dlp, fallback to Whisper speech-to-text
5. Pass extracted text to router_agent (classify: recipe vs non-recipe)
6. If recipe: use extractor_agent (LLM) to extract title, ingredients, steps, timing
7. Normalize ingredients with normalizer_agent
8. Store in PostgreSQL, return to frontend via polling

## Project Structure

### Backend (`/backend`)

- **`app/main.py`**: FastAPI entry point, CORS setup, router registration
- **`app/models.py`**: SQLAlchemy ORM models (User, Recipe, Ingredient, MealPlanEntry, etc.)
- **`app/schemas.py`**: Pydantic v2 schemas (request/response validation)
- **`app/database.py`**: AsyncSession (FastAPI) and sync session (Celery/Alembic) engines
- **`app/auth.py`**: Clerk JWT verification, user provisioning on first login
- **`app/worker.py`**: Celery app config, Beat schedule setup

**Routers** (`/routers`):
- `recipes.py`: GET/POST/PUT/DELETE recipes, search, pagination
- `ingest.py`: POST ingest job, GET job status polling
- `shopping.py`: Generate shopping list from recipes, manage items
- `mealplan.py`: Weekly meal plan CRUD
- `users.py`: List users, update roles (admin only)
- `webhooks.py`: Home Assistant integrations (optional)
- `health.py`: Liveness and detailed health checks

**AI Agents** (`/agents`):
- `openrouter.py`: OpenRouter API client, model constants (FAST, SMART, BALANCED)
- `router_agent.py`: Classifies extracted text as recipe or non-recipe
- `extractor_agent.py`: Structured extraction (title, ingredients, steps) via LLM
- `normalizer_agent.py`: Ingredient normalization (e.g., "1 cup flour" → canonical form)

**Services** (`/services`):
- `scraper.py`: recipe-scrapers wrapper + BeautifulSoup4 fallback for HTML parsing
- `youtube.py`: yt-dlp subtitle fetching, Whisper fallback for speech-to-text
- `whisper_utils.py`: Thread-safe Faster-Whisper model cache
- `ollama.py`: Optional local LLM client

**Tasks** (`/tasks`):
- `ingest.py`: Main Celery task orchestrating the recipe ingestion pipeline
- `maintenance.py`: Periodic warmup tasks, health checks

**Migrations** (`/alembic`):
- `versions/`: Auto-generated migration files (don't edit directly—use `alembic revision --autogenerate`)

### Frontend (`/frontend`)

- **`package.json`**: npm scripts (`dev`, `build`, `start`, `lint`)
- **`next.config.js`**: PWA configuration (next-pwa), image optimization domains
- **`tailwind.config.ts`**: Dark theme tokens, touch-friendly spacing
- **`public/manifest.json`**: PWA manifest (app name, icons, theme color)
- **`src/middleware.ts`**: Clerk route protection (redirects unauthenticated → sign-in)

**Lib** (`/lib`):
- `types.ts`: TypeScript types mirroring backend schemas (Recipe, Ingredient, User, etc.)
- `api.ts`: Typed API client (works in client and server components, auto-includes JWT)
- `utils.ts`: Helpers (cn for Tailwind class merging, formatCookTime, scaleAmount, etc.)
- `hooks.ts`: Custom React hooks (useDebounce, useWakeLock, useLocalStorage)

**Components**:
- Navigation, search, recipe cards, loading spinners, timers
- IngredientChecklist: interactive ingredient check-off in cook mode
- ServingsScaler: multiply ingredient amounts by serving ratio
- JobStatus: poll and display ingest job progress

**Pages** (`/app`):
- `layout.tsx`: Root layout with ClerkProvider, NavBar, PWA wrapper
- `recipes/page.tsx`: Main recipe list with search, filters, pagination
- `add/page.tsx`: Submit recipe URL or manually create recipe
- `recipe/[id]/page.tsx`: Full recipe detail, shopping list button
- `cook/[id]/page.tsx`: Fullscreen cook mode with step timers, swipe nav, Screen Wake Lock
- `shopping-list/page.tsx`: Grouped shopping list, check off items
- `meal-plan/page.tsx`: Weekly calendar, quick meal plan generation
- `admin/page.tsx`: Manage users (admin only)

## Key Patterns & Design Decisions

### Backend Async/Sync Split

- **FastAPI routes**: Use AsyncSession (`async with get_session() as session`)
- **Celery tasks**: Use sync SessionLocal (Celery doesn't support async tasks well)
- **Alembic migrations**: Use sync SessionLocal
- See `app/database.py` for both engine configurations

### Pydantic v2 Validation

- Models inherit from `BaseModel`, use field validators with `@field_validator`
- Schemas use `ConfigDict(from_attributes=True)` to convert SQLAlchemy ORM → Pydantic
- No manual `dict()` conversions needed—ORM objects automatically coerce

### Clerk JWT Auth

- JWT token extracted from `Authorization: Bearer <token>` header
- Verified against Clerk's JWKS endpoint (`CLERK_JWKS_URL`)
- User claims include `sub` (Clerk user ID), `email`, and custom `publicMetadata.role`
- First-time login auto-creates User row in `users` table

### OpenRouter Model Tiers

Three environment variables control AI model selection:

```bash
OPENROUTER_FAST_MODEL      # Cheap, for ingredient string parsing
OPENROUTER_SMART_MODEL     # Smarter, for full recipe extraction
OPENROUTER_BALANCED_MODEL  # Middle ground, for normalization
```

All route through the same OpenRouter API client. Models are independent—you can use GPT for extraction and Mistral for normalization.

### Recipe Ingestion Pipeline (Celery Task)

1. **Input validation**: Accept URL or YouTube link
2. **Content fetch**: scraper.py for URLs, youtube.py for video captions/speech-to-text
3. **Router**: Classify text (recipe vs non-recipe) → skip if not a recipe
4. **Extractor**: LLM to structured extract title, ingredients, steps, cook time
5. **Normalizer**: LLM to standardize ingredient units, quantities
6. **Validation**: Pydantic schemas validate output, create Recipe row
7. **Return**: Job status includes parsed recipe data and any errors

Entire pipeline is in `app/tasks/ingest.py`—each step has try/except to surface errors to frontend via job result.

### Shopping List & Meal Plan

- Shopping list auto-groups by ingredient category (detected at parse time)
- Meal plan associates recipes with specific dates (Mon–Sun)
- Both are user-specific (filter by `current_user.id`)

### PWA & Offline Support

- Service Worker (Workbox) caches static assets and API responses
- "Cook" mode is fully offline-capable (recipes pre-cached)
- Add to Home Screen on mobile (app icon, splash screen, etc.)

## Environment Variables

**Required** (no defaults):
- `CLERK_SECRET_KEY`: Backend JWT verification
- `CLERK_JWKS_URL`: Clerk JWKS endpoint
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`: Frontend sign-in widget
- `OPENROUTER_API_KEY`: AI models

**Important** (has defaults):
- `POSTGRES_PASSWORD`: Default `recipepass` (change in production)
- `CORS_ORIGINS`: Default `http://localhost:3000` (comma-separated list)
- `NEXT_PUBLIC_BACKEND_URL`: Default `http://localhost:8001`

**Optional**:
- `OPENROUTER_*_MODEL`: AI model choices (see Recommended AI Models in README)
- `WHISPER_MODEL_SIZE`: Speech-to-text model size (default `small`)
- `OLLAMA_MODEL`: Local LLM to pull on startup (default `llama3.2:7b`)
- `CLOUDFLARE_TUNNEL_TOKEN`: For external HTTPS access
- `FLOWER_PASSWORD`: Celery monitoring UI password

## Common Dev Tasks

### Add a New API Endpoint

1. Create a router in `app/routers/` (e.g., `comments.py`)
2. Define Pydantic schemas in `app/schemas.py` (request/response)
3. Import and register in `app/main.py` with `app.include_router(...)`
4. If async DB access needed, use `async with get_session()` pattern from existing routers
5. Return Pydantic schema (auto-serializes to JSON)

### Add a Celery Task

1. Create function in `app/tasks/` with `@shared_task` decorator
2. Use sync SessionLocal for database access
3. Return result or raise exception (tracked in Flower UI)
4. Trigger from router via `task.delay(args)` → returns job ID
5. Client polls `/ingest/{job_id}` for status

### Modify Database Schema

1. Edit `app/models.py` (add/remove columns, foreign keys, etc.)
2. Run: `docker compose exec backend alembic revision --autogenerate -m "descriptive message"`
3. Review the generated migration file in `backend/alembic/versions/`
4. Run: `docker compose exec backend alembic upgrade head`
5. Update `app/schemas.py` if request/response format changed

### Debug Database

```bash
# Connect to PostgreSQL directly
docker compose exec postgres psql -U recipeuser -d recipes

# Query recipes
SELECT id, title, ingredient_count FROM recipes LIMIT 5;

# Check user roles
SELECT email, role FROM users;
```

### Monitor Celery Tasks

- Flower UI: http://localhost:5555 (user: `admin`, password: `flowerpass`)
- Shows task queue depth, execution time, success/failure rates
- Can revoke stuck tasks, inspect task args/results

## Testing

No automated test suite currently in the repo. Manual testing:
- Use API docs at http://localhost:8001/docs to test endpoints
- Use frontend at http://localhost:3001 to test user flows
- Check logs: `docker compose logs -f backend` and `docker compose logs -f celery_worker`

## Performance Notes

- Celery worker concurrency is set to 4 (fits 4 simultaneous recipe ingest jobs)
- Whisper model is cached in-memory after first use (fast subsequent calls)
- Recipe scraping can fail silently if website structure changes (BeautifulSoup fallback helps)
- YouTube captions preferred over Whisper (faster, no audio processing)—Whisper is fallback

## Deployment

See README.md for Cloudflare Tunnel setup (HTTPS from anywhere). The `.env` file should never be committed; all secrets come from environment variables at deploy time.

## Frontend Aesthetics

Avoid generic "AI slop" design. Every frontend change should feel genuinely designed for this context — a cooking/recipe app — not like a default template.

**Typography:** Pick fonts that are beautiful and distinctive. Avoid Inter, Roboto, Arial, Space Grotesk, and other overused defaults. Consider editorial food aesthetics: serif/sans pairings like Playfair Display + DM Mono, Instrument Serif + Space Mono, or similar.

**Color & Theme:** Commit to a strong, cohesive palette. Dominant color with sharp accent beats a timid, evenly-distributed scheme. Use CSS variables for consistency. Draw from IDE themes, culinary culture, food editorial design.

**Motion:** CSS-only where possible; Motion library for React when available. Prioritise high-impact moments — one well-orchestrated page load with staggered reveals beats scattered micro-interactions.

**Backgrounds:** Create atmosphere and depth. Layer CSS gradients, geometric patterns, or contextual effects rather than defaulting to flat solid colors.

**Avoid:**
- Generic font families (Inter, Roboto, Arial, system-ui, Space Grotesk)
- Purple gradients on white
- Predictable layouts and cookie-cutter component patterns
- Timid, evenly-distributed palettes with no dominant color
