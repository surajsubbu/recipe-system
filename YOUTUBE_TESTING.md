# YouTube Improvements — Testing Checklist

## Setup

Before testing, restart the backend and Celery worker to load the new code:

```bash
docker compose down
docker compose up -d backend celery_worker
docker compose logs -f backend
```

## Quick Test

### 1. Test with a Normal YouTube Video

Find a cooking video with ingredients/instructions in the description:
- Link: https://www.youtube.com/watch?v=9bAqwJ6i4Ns (example)

**Steps**:
1. Go to http://localhost:3001/add
2. Paste the YouTube URL
3. Submit

**Expected Results**:
- ✅ Recipe appears **within 2-5 seconds**
- ✅ Ingredients and instructions visible (from description)
- ✅ Backend logs show:
  ```
  [ingest] Fetching YouTube video metadata…
  [ingest] Extracting recipe from video description…
  [ingest] Recipe extracted from description. Queueing background transcription for enhancement…
  ```
- ✅ Celery worker logs show (after a delay):
  ```
  [youtube-bg] Transcribed X chars from: ... (source: subtitles)
  ```

### 2. Test with an Age-Restricted Video

**Steps**:
1. Find an age-restricted cooking video
2. Submit URL via http://localhost:3001/add

**Expected Results**:
- If description has content:
  - ✅ Recipe appears from description
  - ✅ User sees the recipe immediately
- Background transcription fails gracefully:
  - ✅ Celery worker logs show:
    ```
    [youtube-bg] transcription failed (expected for restricted videos): ...
    ```
  - ✅ User does NOT see an error message
  - ✅ Recipe is already saved and usable

### 3. Test with a Video that Has Subtitles

**Steps**:
1. Find a YouTube video with English captions/auto-captions
2. Submit the URL

**Expected Results**:
- ✅ Recipe appears from description
- ✅ Background transcription is very fast (no audio download):
  ```
  [youtube-bg] Transcribed X chars from: ... (source: subtitles)
  ```
- ✅ Entire process takes < 10 seconds

### 4. Test with a Regular Website Recipe

**Steps**:
1. Go to http://localhost:3001/add
2. Submit a website URL (e.g., allrecipes.com, bbc.com/food)

**Expected Results**:
- ✅ Works exactly as before (no changes to website recipes)
- ✅ Backend logs show normal scraping flow

## Monitor Progress

### In a Separate Terminal

Watch real-time logs from both services:

```bash
# Terminal 1: Backend & ingest task
docker compose logs -f backend | grep -E "\[ingest\]|\[youtube\]"

# Terminal 2: Celery worker & background tasks
docker compose logs -f celery_worker | grep -E "\[youtube-bg\]|\[ingest\]"
```

### Via Flower Dashboard

Open http://localhost:5555 (password: `flowerpass` by default)

Watch the task queue:
- `app.tasks.ingest.ingest_url_task` should complete in < 10 seconds (for YouTube)
- `app.tasks.ingest.transcribe_youtube_background` may take 30+ seconds (it's background)

## Troubleshooting

### Problem: Recipe doesn't appear quickly

**Check**:
```bash
docker compose logs backend | tail -30
```

**Likely causes**:
1. Backend isn't restarted — try: `docker compose restart backend celery_worker`
2. Recipe description is empty — video may not have description
3. AI model is slow — first request to OpenRouter API may be slow

### Problem: Background transcription never completes

**Check**:
```bash
docker compose logs celery_worker | grep youtube-bg
```

**Likely causes**:
1. Video is age-restricted or geo-blocked — **this is OK**, recipe is already saved
2. No audio track available — **this is OK**, recipe is already saved
3. Celery worker crashed — check: `docker compose ps`

### Problem: See old behavior (long wait, no description extraction)

**Solution**:
1. Verify files were edited: `docker compose exec backend ls -lh app/services/youtube.py`
2. Rebuild container: `docker compose up -d --build backend celery_worker`
3. Clear logs: `docker compose logs --tail 0 -f backend`

## Success Criteria

✅ YouTube recipes appear in < 5 seconds (from description)
✅ Background transcription queue shows in logs
✅ Age-restricted videos don't block the user
✅ Recipe is saved immediately, not waiting for transcription
✅ No new errors in the UI for any video type
