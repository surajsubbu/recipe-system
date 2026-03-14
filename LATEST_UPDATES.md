# Latest Updates - Icons, Transcripts, & Cloudflare Fix

## 1. YouTube Icon + Website Favicon

### Recipe Cards Now Show Source Icons

**YouTube videos**: Red YouTube icon (official YouTube branding)
**Websites**: Website's favicon (from `domain/favicon.ico`)

**Files modified**:
- `frontend/src/components/RecipeCard.tsx`

**How it works**:
- YouTube URLs detected using `isYouTubeUrl()` helper
- Website favicon fetched from `domain/favicon.ico`
- Falls back to globe icon if favicon load fails
- Icons appear in top-right corner of recipe card with tooltip

---

## 2. Video Transcripts Now Stored & Displayed

### Transcript Extraction & Storage

When you ingest a YouTube video, the system now:

1. **Immediately extracts transcript** (subtitles first, then Whisper if needed)
2. **Combines description + transcript** for better AI extraction
3. **Stores transcript in database** for later reference
4. **Displays at bottom of recipe** in a dedicated "Video Transcript" section

**Database changes**:
- Added `transcript` field to `recipes` table
- Migration applied automatically: `add_transcript_field_to_recipes`

**Files modified**:
- `backend/app/models.py` — Added `transcript` column
- `backend/app/schemas.py` — Added `transcript` to `RecipeOut`
- `backend/app/agents/extractor_agent.py` — Added `transcript` to `RecipeData`
- `backend/app/tasks/ingest.py` — Captures and stores transcript
- `frontend/src/lib/types.ts` — Added `transcript` to `Recipe` interface
- `frontend/src/app/recipe/[id]/page.tsx` — Displays transcript section

### Display Format

The transcript appears at the bottom of the recipe detail page:

```
┌─────────────────────────────┐
│  Video Transcript           │
├─────────────────────────────┤
│ [full video transcript text]│
│ preserving line breaks      │
└─────────────────────────────┘
```

Only shows if transcript is available (won't show if extraction failed or recipe is from a website).

---

## 3. Cloudflare Configuration Clarification

### Port Confusion Explained

**Why use port 3000 instead of 3001?**

```
docker-compose.yml port mapping:
  ports: ["3001:3000"]
           ↑     ↑
        host   container
        port   internal port

From your machine (localhost):      Use 3001 ✓
From Cloudflare (inside Docker):    Use 3000 ✓
```

**Cloudflare tunnel runs INSIDE Docker**, so it must use:
- **Internal port**: 3000 (container's port)
- **Service name**: `frontend` (Docker DNS name)

❌ **Wrong** (host port from inside container):
```
localhost:3001    — doesn't exist in container
192.168.0.122:3001 — can't access host IP from inside
```

✅ **Correct** (internal Docker address):
```
http://frontend:3000    — Docker DNS name + internal port
```

### If Cloudflare Still Doesn't Work

Check tunnel logs:
```bash
docker compose logs cloudflared -f
```

Look for connection errors. Common issues:
1. **Token invalid** — re-copy from Cloudflare dashboard
2. **Connection refused** — verify service names match (not IPs)
3. **Port mismatch** — use 3000 (internal), not 3001 (host)

### Correct Configuration

**Cloudflare Zero Trust → Tunnels → Public Hostnames:**

```
Subdomain: recipes
Domain: surajsubramanian.com
Type: HTTP
URL: http://frontend:3000    ← MUST be 3000, not 3001
```

**In `.env`:**
```bash
CLOUDFLARE_TUNNEL_TOKEN=eyJ...
NEXT_PUBLIC_BACKEND_URL=https://recipes-api.surajsubramanian.com
CORS_ORIGINS=https://recipes.surajsubramanian.com,http://localhost:3000
```

**Restart:**
```bash
docker compose restart cloudflared frontend
```

---

## Summary of All Changes

| Feature | Status | Location |
|---------|--------|----------|
| Back button to `/recipes` | ✅ Done | `recipe/[id]/page.tsx` |
| Unit conversion (Original/Metric/Imperial) | ✅ Done | `utils.ts`, `IngredientChecklist.tsx` |
| YouTube icon on cards | ✅ Done | `RecipeCard.tsx` |
| Website favicon on cards | ✅ Done | `RecipeCard.tsx` |
| Video transcript storage | ✅ Done | Database + backend |
| Video transcript display | ✅ Done | Recipe detail page |
| Cloudflare explanation | ✅ Documented | This file |

---

## Testing the New Features

### Test 1: YouTube Recipe with Transcript

1. Go to `http://localhost:3001/add`
2. Paste a YouTube cooking video URL
3. Wait for recipe to appear
4. Check recipe detail page:
   - ✅ Should see YouTube icon on card (red YouTube logo)
   - ✅ Should see transcript at bottom

### Test 2: Website Recipe with Favicon

1. Add a website recipe (e.g., allrecipes.com)
2. Go to recipes list
3. Look at recipe card:
   - ✅ Should see website's favicon (allrecipes icon)

### Test 3: Transcript Display

1. Open a YouTube recipe
2. Scroll to bottom
3. Should see "Video Transcript" section with full transcript text
4. Works even for age-restricted videos (description was extracted)

### Test 4: Cloudflare

1. Update tunnel config with `http://frontend:3000`
2. Restart: `docker compose restart cloudflared frontend`
3. Access from external device: `https://recipes.surajsubramanian.com`
4. Check logs: `docker compose logs cloudflared | grep -i "route"`

---

## Performance Notes

- **Favicon fetching**: Done in component with error handling
- **Transcript extraction**: Happens during ingest (blocking, but fast with subtitles)
- **Transcript display**: Just text rendering, no performance impact

---

## Rollback (If Needed)

If any issues, migrations are reversible:

```bash
# Downgrade one migration
docker compose exec backend alembic downgrade -1

# Check migration status
docker compose exec backend alembic current
```

But the new features are stable and shouldn't cause issues!
