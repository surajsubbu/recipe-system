# 🍽️ Recipe Manager

A self-hosted AI recipe management system. Import recipes from any website or YouTube cooking video, manage a shopping list, and plan your meals for the week — all from a mobile-first PWA.

---

## Features

- **AI Ingest** — paste any recipe URL or YouTube link; AI extracts title, ingredients, steps, and timers automatically
- **YouTube transcription** — uses auto-captions (fast path) or Whisper speech-to-text as fallback
- **Cook Mode** — fullscreen step-by-step view with timers, swipe navigation, and Screen Wake Lock
- **Shopping List** — auto-generated from recipes, grouped by grocery category
- **Meal Planner** — weekly Mon–Sun calendar with one-tap shopping list generation
- **PWA** — installable on mobile (Add to Home Screen), offline-capable via Workbox service worker
- **Clerk Auth** — passwordless / social sign-in, JWT-protected API, admin role management
- **Cloudflare Tunnel** — optional secure HTTPS access from anywhere without port forwarding

---

## Architecture

```
┌──────────────┐  ┌──────────────┐  ┌──────────────────────────────────┐
│   Frontend   │  │   Backend    │  │           Task Queue              │
│  Next.js 14  │→│  FastAPI     │  │  Celery Worker (concurrency=4)    │
│  Clerk Auth  │  │  SQLAlchemy  │  │  ├─ ingest queue (URL / YouTube) │
│  Tailwind    │  │  Alembic     │  │  ├─ maintenance queue            │
│  PWA / SW    │  │  Pydantic v2 │  │  └─ Celery Beat (periodic)       │
└──────────────┘  └──────────────┘  └──────────────────────────────────┘
       │                 │                        │
       └────────┬────────┘                        │
                ▼                                 ▼
        ┌───────────────┐                 ┌───────────────┐
        │   PostgreSQL  │                 │     Redis     │
        │   (data)      │                 │  (broker /    │
        └───────────────┘                 │   backend)    │
                                          └───────────────┘
         ┌──────────┐   ┌─────────┐   ┌──────────────────┐
         │  Ollama  │   │ Flower  │   │  Cloudflare       │
         │  (local  │   │  (job   │   │  Tunnel (HTTPS)   │
         │   LLM)   │   │   UI)   │   │                   │
         └──────────┘   └─────────┘   └──────────────────┘
```

**Services (11 total):**

| Service        | Port  | Description                          |
|----------------|-------|--------------------------------------|
| `frontend`     | 3000  | Next.js 14 app                       |
| `backend`      | 8000  | FastAPI REST API                     |
| `postgres`     | 5432  | Recipe database                      |
| `redis`        | 6379  | Celery broker + result backend       |
| `celery_worker`| —     | Background task runner               |
| `celery_beat`  | —     | Periodic task scheduler              |
| `flower`       | 5555  | Celery monitoring dashboard          |
| `ollama`       | 11434 | Local LLM (optional)                 |
| `n8n`          | 5678  | Workflow automation (optional)       |
| `cloudflared`  | —     | Cloudflare Tunnel (optional)         |

---

## Prerequisites

- **Windows 10/11** with WSL2 enabled
- **Docker Desktop** ≥ 4.30 with WSL2 backend enabled
- **Git**
- A free [Clerk](https://clerk.com) account (auth)
- A free [OpenRouter](https://openrouter.ai) account (AI models)
- A free [Cloudflare](https://cloudflare.com) account with a domain (optional, for external access)

---

## Quick Start

### 1. Clone the repository

```bash
git clone <your-repo-url> recipe-system
cd recipe-system
```

### 2. Configure environment variables

The `.env` file is already present with placeholder values. Edit it to add your real keys:

```bash
# Open in your editor
notepad .env
```

**Required fields to fill in:**

| Variable | Where to get it |
|---|---|
| `CLERK_SECRET_KEY` | Clerk Dashboard → API Keys → Secret keys |
| `CLERK_JWKS_URL` | Clerk Dashboard → API Keys → copy the "JWKS Endpoint" URL |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk Dashboard → API Keys → Publishable key |
| `OPENROUTER_API_KEY` | [openrouter.ai/keys](https://openrouter.ai/keys) |
| `POSTGRES_PASSWORD` | Choose any strong password |

**Optional fields:**

| Variable | Default | Description |
|---|---|---|
| `OPENROUTER_FAST_MODEL` | `openai/gpt-5-nano` | Model for ingredient parsing (cheap) |
| `OPENROUTER_SMART_MODEL` | `openai/gpt-5-nano` | Model for recipe extraction (smart) |
| `OPENROUTER_BALANCED_MODEL` | `openai/gpt-5-nano` | Model for normalization (balanced) |
| `WHISPER_MODEL_SIZE` | `small` | `tiny` / `base` / `small` / `medium` / `large` |
| `OLLAMA_MODEL` | `llama3.2:7b` | Ollama model to pull on startup |
| `FLOWER_PASSWORD` | `flowerpass` | Celery Flower UI password |
| `CLOUDFLARE_TUNNEL_TOKEN` | — | From Cloudflare Zero Trust dashboard |
| `HA_WEBHOOK_SECRET` | — | Home Assistant integration secret |

### 3. Set up Clerk

1. Go to [dashboard.clerk.com](https://dashboard.clerk.com) → Create application
2. Enable your preferred sign-in methods (Email, Google, etc.)
3. Under **API Keys**, copy the three Clerk values into `.env`
4. Under **JWT Templates** (optional), you can add custom claims — the app reads `role` from `publicMetadata`

### 4. Start all services

```bash
docker compose up -d
```

First run downloads images and builds containers — takes 3–5 minutes. Subsequent starts are instant.

**Watch the logs:**
```bash
docker compose logs -f backend
docker compose logs -f celery_worker
```

### 5. Run database migrations

Migrations run automatically on backend startup. To run them manually:

```bash
docker compose exec backend alembic upgrade head
```

### 6. Open the app

| Service | URL |
|---|---|
| **App** | [http://localhost:3000](http://localhost:3000) |
| **API docs** | [http://localhost:8000/docs](http://localhost:8000/docs) |
| **Flower** | [http://localhost:5555](http://localhost:5555) |
| **n8n** | [http://localhost:5678](http://localhost:5678) |
| **Ollama** | [http://localhost:11434](http://localhost:11434) |

Sign in via Clerk on first visit — your account is auto-provisioned. To make yourself admin, connect to the database directly or use the Clerk Dashboard to set `publicMetadata: { "role": "admin" }` on your user.

---

## Making Your First Admin

After signing in at least once (so your user row exists in the database):

**Option A — via Clerk Dashboard:**
1. Clerk Dashboard → Users → click your user
2. **Metadata** → Public metadata → set `{"role": "admin"}`
3. Sign out and back in

**Option B — direct SQL:**
```bash
docker compose exec postgres psql -U recipeuser -d recipes -c \
  "UPDATE users SET role = 'admin' WHERE email = 'you@example.com';"
```

---

## Recommended AI Models

The three OpenRouter model tiers can be independently configured. Recommended real-world options:

| Tier | Env var | Suggested model | Use case |
|---|---|---|---|
| Fast | `OPENROUTER_FAST_MODEL` | `google/gemini-flash-1.5` | Ingredient string parsing |
| Smart | `OPENROUTER_SMART_MODEL` | `anthropic/claude-3.5-sonnet` | Full recipe extraction from text |
| Balanced | `OPENROUTER_BALANCED_MODEL` | `mistralai/mistral-7b-instruct` | Ingredient normalisation |

Change any model to anything in the [OpenRouter model list](https://openrouter.ai/models). Restart the backend after changing:
```bash
docker compose restart backend celery_worker
```

---

## Whisper Model Sizes

Set `WHISPER_MODEL_SIZE` in `.env`:

| Size | VRAM | Speed | Accuracy |
|---|---|---|---|
| `tiny` | ~1 GB | Very fast | Low |
| `base` | ~1 GB | Fast | OK |
| `small` | ~2 GB | Moderate | Good ✅ |
| `medium` | ~5 GB | Slow | Better |
| `large` | ~10 GB | Very slow | Best |

The model is downloaded on first use and cached in the `whisper_models` Docker volume. `small` is the default and works well for English cooking videos.

---

## Cloudflare Tunnel (External Access)

To access your instance from any device without opening firewall ports:

1. Sign in at [dash.cloudflare.com](https://dash.cloudflare.com) — add a domain
2. **Zero Trust** → **Access** → **Tunnels** → **Create a tunnel**
3. Name it, then copy the tunnel token into `.env`:
   ```
   CLOUDFLARE_TUNNEL_TOKEN=eyJ...
   ```
4. In the tunnel config, add public hostnames:
   - `recipes.yourdomain.com` → `http://frontend:3000`
   - `recipes-api.yourdomain.com` → `http://backend:8000` (optional)
5. Update `NEXT_PUBLIC_BACKEND_URL` and `CORS_ORIGINS` in `.env` to use your domain
6. Restart:
   ```bash
   docker compose up -d cloudflared
   ```

---

## Development Workflow

The frontend and backend both mount their source directories as volumes, so code changes hot-reload without rebuilding containers.

### Backend (FastAPI)

```bash
# Tail API logs with auto-reload
docker compose logs -f backend

# Run a one-off Python command inside the container
docker compose exec backend python -c "from app.models import *; print('ok')"

# Create a new Alembic migration after changing models.py
docker compose exec backend alembic revision --autogenerate -m "add column xyz"
docker compose exec backend alembic upgrade head
```

### Frontend (Next.js)

```bash
# Tail frontend logs
docker compose logs -f frontend

# Install a new package (rebuilds node_modules volume)
docker compose exec frontend npm install some-package
docker compose restart frontend
```

### Celery / Tasks

```bash
# Trigger an ingest task manually
docker compose exec backend python -c "
from app.tasks.ingest import ingest_url_task
r = ingest_url_task.delay('https://www.allrecipes.com/recipe/10813/', 1)
print('job id:', r.id)
"

# Monitor tasks
open http://localhost:5555  # Flower UI

# Restart worker after code change
docker compose restart celery_worker
```

---

## Common Commands

```bash
# Start everything
docker compose up -d

# Stop everything (keeps data volumes)
docker compose down

# Stop and wipe all data (destructive!)
docker compose down -v

# Rebuild a single service after Dockerfile change
docker compose up -d --build backend

# View resource usage
docker stats

# Enter a running container
docker compose exec backend bash
docker compose exec frontend sh

# Check health endpoints
curl http://localhost:8000/health
curl http://localhost:8000/health/detailed | python -m json.tool
```

---

## API Reference

Interactive docs available at **[http://localhost:8000/docs](http://localhost:8000/docs)** (Swagger UI) and **[http://localhost:8000/redoc](http://localhost:8000/redoc)**.

### Key endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Liveness probe (always 200) |
| `GET` | `/health/detailed` | Service health + latency |
| `GET` | `/recipes` | Paginated recipe list (`?page&search&tag`) |
| `POST` | `/recipes` | Create recipe manually |
| `GET` | `/recipes/{id}` | Full recipe detail |
| `PUT` | `/recipes/{id}` | Update recipe |
| `DELETE` | `/recipes/{id}` | Delete recipe |
| `POST` | `/ingest` | Start URL ingest job |
| `GET` | `/ingest/{job_id}` | Poll job status |
| `GET` | `/shopping-list` | Get active shopping list |
| `POST` | `/shopping-list/generate/{recipe_id}` | Add recipe to list |
| `DELETE` | `/shopping-list/clear-checked` | Remove checked items |
| `GET` | `/meal-plan` | Get week (`?week_of=YYYY-MM-DD`) |
| `POST` | `/meal-plan` | Add meal plan entry |
| `GET` | `/users` | List users (admin) |
| `PATCH` | `/users/{id}/role` | Update user role (admin) |
| `POST` | `/users/invite` | Invite user via Clerk (admin) |

---

## Troubleshooting

### Backend won't start

```bash
docker compose logs backend
```
- **"relation does not exist"** — migrations haven't run yet:
  ```bash
  docker compose exec backend alembic upgrade head
  ```
- **"could not connect to server"** — postgres isn't ready yet; wait 10s and retry
- **"invalid JWKS"** — check `CLERK_JWKS_URL` in `.env` is the correct URL for your Clerk app

### Frontend shows 401 / infinite redirect

- Confirm `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` matches your Clerk app
- Check browser console for CORS errors — update `CORS_ORIGINS` in `.env`
- Ensure `NEXT_PUBLIC_BACKEND_URL` is reachable from the browser (`http://localhost:8000` for local)

### Ingest job stays "pending"

```bash
docker compose logs celery_worker
```
- Worker may have crashed — restart: `docker compose restart celery_worker`
- Redis connection issue — check `docker compose logs redis`
- Check Flower at [http://localhost:5555](http://localhost:5555) for task details

### YouTube ingest fails

- The video may be age-restricted, private, or geo-blocked
- Try enabling Whisper fallback — it's automatic if subtitles aren't found
- Very long videos (>2 hrs) may hit the `task_time_limit` (1500s); try a shorter clip

### Whisper model download is slow

The model downloads on first use to the `whisper_models` volume. `small` is ~460 MB. Keep the container running and check:
```bash
docker compose logs celery_worker | grep -i whisper
```

### Out of disk space

Docker volumes accumulate. Clean up unused images:
```bash
docker system prune --volumes
```
⚠️ This removes all stopped containers and unused volumes — backup data first if needed.

### Port already in use

If another service is using port 3000, 8000, etc., edit the left-hand port in `docker-compose.yml`:
```yaml
ports:
  - "3001:3000"  # host:container — change 3001 to any free port
```

---

## Project Structure

```
recipe-system/
├── .env                          # Environment variables (keep secret)
├── docker-compose.yml            # All 11 services
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── alembic/                  # Database migrations
│   │   ├── env.py
│   │   └── versions/
│   └── app/
│       ├── main.py               # FastAPI app + CORS + router registration
│       ├── models.py             # SQLAlchemy models
│       ├── schemas.py            # Pydantic v2 schemas
│       ├── database.py           # Async (FastAPI) + sync (Celery) engines
│       ├── auth.py               # Clerk JWT verification + user provisioning
│       ├── worker.py             # Celery app + Beat schedule
│       ├── agents/
│       │   ├── openrouter.py     # OpenRouter client + model constants
│       │   ├── router_agent.py   # URL type classifier
│       │   ├── extractor_agent.py # Recipe extraction (structured + text)
│       │   └── normalizer_agent.py # Ingredient normalisation
│       ├── routers/
│       │   ├── recipes.py
│       │   ├── ingest.py
│       │   ├── shopping.py
│       │   ├── mealplan.py
│       │   ├── users.py
│       │   ├── webhooks.py
│       │   └── health.py
│       ├── services/
│       │   ├── scraper.py        # recipe-scrapers + BS4 fallback
│       │   ├── youtube.py        # yt-dlp subtitles + Whisper fallback
│       │   ├── whisper_utils.py  # Thread-safe model cache
│       │   └── ollama.py         # Local Ollama client
│       └── tasks/
│           ├── ingest.py         # Main ingest pipeline task
│           └── maintenance.py    # Warm-up + health-ping tasks
│
└── frontend/
    ├── Dockerfile
    ├── package.json
    ├── next.config.js            # PWA config + image domains
    ├── tailwind.config.ts        # Dark theme + touch tokens
    ├── public/
    │   ├── manifest.json         # PWA manifest
    │   └── icons/                # App icons (192, 512, 180 px)
    └── src/
        ├── middleware.ts         # Clerk route protection
        ├── lib/
        │   ├── types.ts          # TypeScript types (mirrors backend schemas)
        │   ├── api.ts            # Typed API client (client + server fetch)
        │   ├── utils.ts          # cn(), formatCookTime(), scaleAmount()…
        │   └── hooks.ts          # useDebounce, useWakeLock, useLocalStorage
        ├── components/
        │   ├── NavBar.tsx
        │   ├── RecipeCard.tsx
        │   ├── SearchBar.tsx
        │   ├── TagFilter.tsx
        │   ├── LoadingSpinner.tsx
        │   ├── JobStatus.tsx
        │   ├── ServingsScaler.tsx
        │   ├── IngredientChecklist.tsx
        │   └── StepTimer.tsx
        └── app/
            ├── layout.tsx        # Root layout (ClerkProvider + NavBar)
            ├── page.tsx          # Redirect → /recipes
            ├── globals.css       # CSS tokens + utilities
            ├── sign-in/[[...sign-in]]/page.tsx
            ├── recipes/page.tsx
            ├── add/page.tsx
            ├── recipe/[id]/page.tsx
            ├── cook/[id]/page.tsx
            ├── shopping-list/page.tsx
            ├── meal-plan/page.tsx
            └── admin/page.tsx
```

---

## Security Notes

- `.env` contains real secrets — **never commit it to a public repository**. Add `.env` to `.gitignore`.
- The `CLERK_SECRET_KEY` is backend-only and never sent to the browser.
- `NEXT_PUBLIC_*` variables are embedded in the browser bundle — only put non-sensitive values there.
- Cloudflare Tunnel token grants full tunnel access — rotate it from the Cloudflare dashboard if compromised.
- The OpenRouter API key is backend-only and never exposed to the frontend.

---

## License

MIT
