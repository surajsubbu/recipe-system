# Fixes Applied

## 1. ✅ Filters Fixed

**Problem**: Filters weren't working because frontend was sending `tag` but backend expects `tags`.

**Fixed in**: `frontend/src/lib/api.ts` line 97
```javascript
// Before:
if (params.tag) qs.set("tag", params.tag);

// After:
if (params.tag) qs.append("tags", params.tag);
```

**Test**: Go to recipes list and click tag filter - should now filter results correctly.

---

## 2. 📺 Transcript Status

The code for storing and displaying transcripts has been correctly applied, but **only NEW YouTube videos will have transcripts**.

**Why?** The database field is NEW - old recipes have NULL transcript value.

### How to Test Transcripts:

1. Go to http://localhost:3001/add
2. **Paste a fresh YouTube URL** (not one you've already added)
3. Wait for recipe to be ingested
4. Open the recipe detail page
5. **Scroll to bottom** - should see "Video Transcript" section

### What's Working:
- ✅ Database field added (`transcript` column)
- ✅ Migration applied automatically
- ✅ API returns transcript field (check browser DevTools → Network → recipe endpoint)
- ✅ Frontend displays transcript section
- ✅ Transcript is extracted during ingest

### If Transcript Still Doesn't Show:

Check browser console (F12 → Console tab):
- Any errors about `transcript` field?
- Try hard-refresh: `Ctrl+Shift+R`

Check API response:
- Open DevTools (F12)
- Go to Network tab
- Click a recipe
- Find `recipe/{id}` request
- Check response - should have `"transcript": "..."` field

---

## 3. ⚠️ Cloudflare - Invalid Tunnel Secret

Your error: **"Unauthorized: Invalid tunnel secret"**

This means your `CLOUDFLARE_TUNNEL_TOKEN` in `.env` is:
- ❌ Wrong/corrupted
- ❌ Expired
- ❌ From a different tunnel

### Fix It:

1. Go to **Cloudflare Dashboard**
2. **Zero Trust → Networks → Tunnels**
3. Click your tunnel
4. Find the token at the top or in the settings
5. Copy the FULL token (starts with `eyJ...`)
6. Update your `.env`:
   ```bash
   CLOUDFLARE_TUNNEL_TOKEN=<paste-full-token-here>
   ```
7. Restart cloudflared:
   ```bash
   docker compose restart cloudflared
   ```
8. Wait 30 seconds
9. Check logs: `docker compose logs cloudflared -f`
   - Should see: `Registered tunnel connection` (no ERR lines)

### Verify It's Working:

When tunnel connects successfully, you'll see:
```
[INF] Registered tunnel connection
```

NOT this:
```
[ERR] Unauthorized: Invalid tunnel secret
```

---

## Quick Testing Checklist

- [ ] **Filters**: Go to recipes list → click a tag → recipes filter correctly
- [ ] **YouTube Transcript**: Add NEW YouTube video → scroll to bottom → see transcript
- [ ] **Website Favicon**: Add website recipe → see favicon icon on card
- [ ] **YouTube Icon**: Check cards have red YouTube icon for videos
- [ ] **Back Button**: From recipe detail → click Back → goes to `/recipes`
- [ ] **Unit Conversion**: Open recipe → click Metric/Imperial → units convert
- [ ] **Cloudflare**: Check logs for "Registered tunnel connection"

---

## Frontend Changes Already Applied

```bash
docker compose restart frontend
```

This has already been done, so filters should work immediately after restart.

---

## Need More Help?

1. **Filters still not working?**
   - Clear browser cache: `Ctrl+Shift+Delete`
   - Hard refresh: `Ctrl+Shift+R`
   - Check DevTools → Network tab → see `tags` param in URL

2. **Transcript not showing?**
   - Must be a NEW YouTube video (not old ones)
   - Check DevTools → Network → recipe response has `transcript` field
   - Scroll to bottom of recipe detail page

3. **Cloudflare still failing?**
   - Regenerate token from Cloudflare dashboard
   - Run: `docker compose restart cloudflared`
   - Share logs: `docker compose logs cloudflared`
