# Setup Guide

Full instructions for running your own instance.

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

Edit `.env` to add your real keys:

```bash
notepad .env
```

**Required fields:**

| Variable | Where to get it |
|---|---|
| `CLERK_SECRET_KEY` | Clerk Dashboard → API Keys → Secret keys |
| `CLERK_JWKS_URL` | Clerk Dashboard → API Keys → JWKS Endpoint URL |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk Dashboard → API Keys → Publishable key |
| `OPENROUTER_API_KEY` | [openrouter.ai/keys](https://openrouter.ai/keys) |
| `POSTGRES_PASSWORD` | Choose any strong password |

**Optional fields:**

| Variable | Default | Description |
|---|---|---|
| `OPENROUTER_FAST_MODEL` | `openai/gpt-4o-mini` | Model for ingredient parsing (cheap) |
| `OPENROUTER_SMART_MODEL` | `anthropic/claude-3.5-sonnet` | Model for recipe extraction |
| `OPENROUTER_BALANCED_MODEL` | `google/gemini-flash-1.5` | Model for normalisation |
| `WHISPER_MODEL_SIZE` | `small` | `tiny` / `base` / `small` / `medium` / `large` |
| `OLLAMA_MODEL` | `llama3.2:7b` | Ollama model to pull on startup |
| `FLOWER_PASSWORD` | `flowerpass` | Celery Flower UI password |
| `CLOUDFLARE_TUNNEL_TOKEN` | — | From Cloudflare Zero Trust dashboard |

### 3. Set up Clerk

1. Go to [dashboard.clerk.com](https://dashboard.clerk.com) → Create application
2. Enable your preferred sign-in methods (Email, Google, etc.)
3. Under **API Keys**, copy the three Clerk values into `.env`

### 4. Start all services

```bash
docker compose up -d
```

First run downloads images and builds containers — takes 3–5 minutes. Subsequent starts are instant.

```bash
# Watch logs
docker compose logs -f backend
docker compose logs -f celery_worker
```

### 5. Open the app

| Service | URL |
|---|---|
| **App** | [http://localhost:3000](http://localhost:3000) |
| **API docs** | [http://localhost:8000/docs](http://localhost:8000/docs) |
| **Flower** | [http://localhost:5555](http://localhost:5555) |

---

## Making Your First Admin

After signing in at least once:

**Option A — via Clerk Dashboard:**
1. Clerk Dashboard → Users → click your user
2. Metadata → Public metadata → set `{"role": "admin"}`
3. Sign out and back in

**Option B — direct SQL:**
```bash
docker compose exec postgres psql -U recipeuser -d recipes -c \
  "UPDATE users SET role = 'admin' WHERE email = 'you@example.com';"
```

---

## Recommended AI Models

| Tier | Env var | Suggested model | Use case |
|---|---|---|---|
| Fast | `OPENROUTER_FAST_MODEL` | `google/gemini-flash-1.5` | Ingredient string parsing |
| Smart | `OPENROUTER_SMART_MODEL` | `anthropic/claude-3.5-sonnet` | Full recipe extraction |
| Balanced | `OPENROUTER_BALANCED_MODEL` | `mistralai/mistral-7b-instruct` | Ingredient normalisation |

Any model from the [OpenRouter model list](https://openrouter.ai/models) works. Restart after changing:
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

`small` is the default and works well for English cooking videos.

---

## Cloudflare Tunnel (External Access)

To access your instance from anywhere without port forwarding:

1. Sign in at [dash.cloudflare.com](https://dash.cloudflare.com) — add a domain
2. **Zero Trust** → **Access** → **Tunnels** → **Create a tunnel**
3. Copy the tunnel token into `.env`:
   ```
   CLOUDFLARE_TUNNEL_TOKEN=eyJ...
   ```
4. Add public hostnames in the tunnel config:
   - `recipes.yourdomain.com` → `http://frontend:3000`
   - `recipes-api.yourdomain.com` → `http://backend:8000` (optional)
5. Update `NEXT_PUBLIC_BACKEND_URL` and `CORS_ORIGINS` in `.env` to use your domain
6. Start the tunnel:
   ```bash
   docker compose up -d cloudflared
   ```

---

## Common Commands

```bash
# Start everything
docker compose up -d

# Stop everything (keeps data)
docker compose down

# Stop and wipe all data (destructive!)
docker compose down -v

# Rebuild a single service
docker compose up -d --build backend

# Enter a container
docker compose exec backend bash

# Check health
curl http://localhost:8000/health
```

---

## Troubleshooting

### Backend won't start
```bash
docker compose logs backend
```
- **"relation does not exist"** — run migrations: `docker compose exec backend alembic upgrade head`
- **"could not connect to server"** — postgres isn't ready yet; wait 10s and retry
- **"invalid JWKS"** — check `CLERK_JWKS_URL` in `.env`

### Frontend shows 401 / infinite redirect
- Confirm `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` matches your Clerk app
- Check browser console for CORS errors — update `CORS_ORIGINS` in `.env`

### Ingest job stays "pending"
```bash
docker compose logs celery_worker
```
- Restart worker: `docker compose restart celery_worker`
- Check Flower at [http://localhost:5555](http://localhost:5555) for task details

### YouTube ingest fails
- The video may be age-restricted, private, or geo-blocked
- Whisper fallback is automatic if captions aren't found
- Very long videos (>2 hrs) may hit the task time limit

### Out of disk space
```bash
docker system prune --volumes
```
⚠️ Removes all stopped containers and unused volumes — backup first if needed.

---

## Services

| Service | Port | Description |
|---|---|---|
| `frontend` | 3000 | Next.js app |
| `backend` | 8000 | FastAPI REST API |
| `postgres` | 5432 | Recipe database |
| `redis` | 6379 | Celery broker |
| `celery_worker` | — | Background task runner |
| `celery_beat` | — | Periodic task scheduler |
| `flower` | 5555 | Task monitoring UI |
| `ollama` | 11434 | Local LLM (optional) |
| `cloudflared` | — | Cloudflare Tunnel (optional) |

---

## Security Notes

- `.env` contains real secrets — **never commit it to a public repo**
- `CLERK_SECRET_KEY` is backend-only, never sent to the browser
- `NEXT_PUBLIC_*` variables are embedded in the browser bundle — only put non-sensitive values there
- Rotate the Cloudflare Tunnel token from the dashboard if it's ever exposed
