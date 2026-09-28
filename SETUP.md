# Setup Guide

Full instructions for running your own instance — on a Linux/Unraid server or on Windows with Docker Desktop.

---

## Prerequisites

- **Docker** with the Compose plugin (`docker compose version` should work)
  - Linux / Unraid: Docker Engine ≥ 24
  - Windows 10/11: Docker Desktop ≥ 4.30 with the WSL2 backend
- **Git**
- ~6 GB free disk for images, ~2 GB free RAM while running
- A free [Clerk](https://clerk.com) account (auth)
- An [OpenRouter](https://openrouter.ai) account with a few dollars of credit (AI models)
- A [Cloudflare](https://cloudflare.com) account with a domain (optional, for access from outside your network)

---

## Quick Start

### 1. Clone the repository

```bash
# Unraid: keep it with your other app data
cd /mnt/user/appdata
git clone https://github.com/surajsubbu/recipe-system.git
cd recipe-system
```

### 2. Create `.env` from the template

```bash
cp .env.example .env
nano .env        # Windows: notepad .env
```

Fill in every `CHANGE_ME` value:

| Variable | Where to get it |
|---|---|
| `CLERK_SECRET_KEY` | Clerk Dashboard → API Keys → Secret key (`sk_test_…`) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk Dashboard → API Keys → Publishable key (`pk_test_…`) |
| `CLERK_JWKS_URL` | Clerk Dashboard → API Keys → JWKS URL |
| `OPENROUTER_API_KEY` | [openrouter.ai/keys](https://openrouter.ai/keys) |
| `POSTGRES_PASSWORD`, `FLOWER_PASSWORD`, `HA_WEBHOOK_SECRET` | Generate each with `openssl rand -hex 24` |
| `NEXT_PUBLIC_BACKEND_URL` | `http://<server-ip>:8001` (see note below) |
| `CORS_ORIGINS` | `http://<server-ip>:3001,http://localhost:3001` |

> **Why the server IP?** Your *browser* talks to the backend directly. `localhost` only works in a browser running on the server itself — phones and laptops need the server's LAN address (or your public domain, see [Cloudflare Tunnel](#cloudflare-tunnel-external-access)).

> **Keep `POSTGRES_PASSWORD` stable.** The database takes its password once, when its volume is first created. Changing it later means the backend can't log in.

The template's other values (AI models, Clerk redirect settings, Whisper size) are sensible defaults — see the comments in `.env.example`.

### 3. Set up Clerk

1. Go to [dashboard.clerk.com](https://dashboard.clerk.com) → Create application
2. Enable your preferred sign-in methods (Email, Google, etc.)
3. Stay on **Development** keys — they work on any address, including plain `http` on a LAN IP. Production keys require HTTPS on your own domain plus extra DNS records.
4. Copy the three API Keys values into `.env`

### 4. Start the app

```bash
docker compose up -d --build
```

First run builds the images — about 5 minutes. This starts 7 containers: `postgres`, `redis`, `backend`, `celery_worker`, `celery_beat`, `flower`, `frontend`. Database migrations run automatically.

```bash
docker compose ps                  # all should be "Up", most "(healthy)"
docker compose logs -f backend
```

The extras — `ollama` (local LLM), `n8n` (automation) and `cloudflared` (this repo's own tunnel) — are opt-in:

```bash
docker compose --profile optional up -d
```

### 5. Open the app

| Service | URL |
|---|---|
| **App** | `http://<server-ip>:3001` |
| **API docs** | `http://<server-ip>:8001/docs` |
| **Flower** (task monitor) | `http://<server-ip>:5555` — user `admin`, password `FLOWER_PASSWORD` |

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

## Where Your Data Lives

- **Recipes, shopping lists, meal plans** → PostgreSQL, stored in the Docker volume `recipe-system_postgres_data` (under Docker's own directory, **not** in the repo folder).
- **Recipe photos** are not downloaded — only the link to the original website is stored.
- **Secrets** → `.env` in the repo folder. Back it up; it's the only copy of your database password.

⚠️ Folder-based backup tools (e.g. Unraid's Appdata Backup) **do not** include Docker volumes. Export the database to a file they do include:

```bash
mkdir -p backups
docker compose exec -T postgres pg_dump -U recipeuser -d recipes | gzip > backups/recipes-$(date +%F).sql.gz

# Restore into a fresh install
gunzip -c backups/recipes-YYYY-MM-DD.sql.gz | docker compose exec -T postgres psql -U recipeuser -d recipes
```

---

## Recommended AI Models

| Tier | Env var | Default in `.env.example` | Use case |
|---|---|---|---|
| Fast | `OPENROUTER_FAST_MODEL` | `google/gemini-2.5-flash-lite` | Ingredient string parsing |
| Smart | `OPENROUTER_SMART_MODEL` | `anthropic/claude-sonnet-4.5` | Full recipe extraction |
| Balanced | `OPENROUTER_BALANCED_MODEL` | `google/gemini-2.5-flash` | Ingredient normalisation |

OpenRouter retires old model IDs over time. If recipe ingestion suddenly fails, check the IDs still exist at [openrouter.ai/models](https://openrouter.ai/models). Restart after changing:
```bash
docker compose up -d backend celery_worker
```

---

## Whisper Model Sizes

Set `WHISPER_MODEL_SIZE` in `.env` (speech-to-text for YouTube videos without captions):

| Size | RAM | Speed | Accuracy |
|---|---|---|---|
| `tiny` | ~1 GB | Very fast | Low |
| `base` | ~1 GB | Fast | OK ✅ (default — good for ≤8 GB servers) |
| `small` | ~2 GB | Moderate | Good |
| `medium` | ~5 GB | Slow | Better |
| `large` | ~10 GB | Very slow | Best |

The worker runs 4 jobs at once, so budget for several copies of the model.

---

## Cloudflare Tunnel (External Access)

The browser needs to reach **both** the frontend and the backend, so the tunnel needs **two public hostnames**. You can use an existing tunnel (e.g. an Unraid cloudflared container) or this repo's `cloudflared` service.

1. Cloudflare **Zero Trust** → **Networks** → **Tunnels** → your tunnel (or **Create a tunnel**)
2. Add two public hostnames (replace the IP with your server's):
   | Hostname | Service |
   |---|---|
   | `recipe.example.com` | `HTTP` → `192.168.x.x:3001` |
   | `recipe-api.example.com` | `HTTP` → `192.168.x.x:8001` |
3. Update `.env`:
   ```
   NEXT_PUBLIC_BACKEND_URL=https://recipe-api.example.com
   CORS_ORIGINS=https://recipe.example.com,http://192.168.x.x:3001,http://localhost:3001
   ```
4. Apply: `docker compose up -d`
5. Use `https://recipe.example.com` everywhere, including at home.

**Using this repo's tunnel container instead:** put the tunnel token in `CLOUDFLARE_TUNNEL_TOKEN`, point the hostnames at `http://frontend:3001` and `http://backend:8000`, and run `docker compose --profile optional up -d cloudflared`.

All recipe/shopping/meal-plan API routes require a signed-in user. Set `HA_WEBHOOK_SECRET` before exposing the backend, or the Home Assistant webhook is open.

---

## Common Commands

```bash
docker compose up -d                  # start / apply .env changes
docker compose down                   # stop (keeps data)
docker compose up -d --build backend  # rebuild one service
docker compose exec backend bash      # shell into a container
curl http://localhost:8001/health     # backend health

# Update to the latest code
git pull && docker compose up -d --build

# ⚠️ Stop AND delete all data (recipes included)
docker compose down -v
```

---

## Troubleshooting

### Backend won't start
```bash
docker compose logs backend
```
- **`/app/entrypoint.sh: permission denied`** — the script lost its executable bit (e.g. copied without git). Fix: `chmod +x backend/entrypoint.sh && docker compose up -d`
- **`password authentication failed`** — `POSTGRES_PASSWORD` changed after the database was created. Restore the old value.
- **"relation does not exist"** — run migrations: `docker compose exec backend alembic upgrade head`
- **"invalid JWKS"** — check `CLERK_JWKS_URL` in `.env`

### Sign-in lands on a Clerk "Welcome… Start building" page
You signed in on Clerk's hosted site instead of the app. Make sure the four `NEXT_PUBLIC_CLERK_SIGN_*` settings from `.env.example` are in `.env`, run `docker compose up -d frontend`, and open the app's own address.

### Pages load but recipes don't / CORS errors in the browser console
- `NEXT_PUBLIC_BACKEND_URL` must be reachable from the browser (not `localhost` on another device), and must be `https` if the app is opened over `https`.
- The address in the browser bar must be listed in `CORS_ORIGINS`.
- Apply with `docker compose up -d`.

### Ingest job stays "pending" or fails
```bash
docker compose logs celery_worker
```
- Check the OpenRouter model IDs still exist and the account has credit
- Restart worker: `docker compose restart celery_worker`
- Check Flower for task details

### YouTube ingest fails
- The video may be age-restricted, private, or geo-blocked
- Whisper fallback is automatic if captions aren't found
- Very long videos (>2 hrs) may hit the task time limit

---

## Services

| Service | Host port | Description |
|---|---|---|
| `frontend` | 3001 | Next.js app |
| `backend` | 8001 | FastAPI REST API |
| `postgres` | 5433 | Recipe database |
| `redis` | 6380 | Celery broker |
| `celery_worker` | — | Background task runner |
| `celery_beat` | — | Periodic task scheduler |
| `flower` | 5555 | Task monitoring UI |
| `ollama` | 11434 | Local LLM (optional profile) |
| `n8n` | 5678 | Automation (optional profile) |
| `cloudflared` | — | Cloudflare Tunnel (optional profile) |

Change the left-hand port numbers in `docker-compose.yml` if any clash with other services.

---

## Security Notes

- `.env` contains real secrets — **never commit it**. Only `.env.example` (placeholders) belongs in git.
- `CLERK_SECRET_KEY` is backend-only, never sent to the browser
- `NEXT_PUBLIC_*` variables are embedded in the browser bundle — only put non-sensitive values there
- The frontend runs the Next.js development server (hot reload). It's fine at home; for a public deployment, a production build is faster and hides error details.
- Rotate the Cloudflare Tunnel token from the dashboard if it's ever exposed
