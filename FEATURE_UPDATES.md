# Feature Updates

This document describes the four new features added to the recipe system.

## 1. Back Button Navigation

**File**: `frontend/src/app/recipe/[id]/page.tsx`

The back button on the recipe detail page now navigates to `/recipes` instead of using browser history.

```
Recipe Detail Page (http://localhost:3001/recipe/7)
   ↓ Click Back Button
Recipe List Page (http://localhost:3001/recipes)
```

**Change**:
- `onClick={() => router.back()}` → `onClick={() => router.push("/recipes")}`

---

## 2. Cloudflare Tunnel Configuration

**Status**: Requires manual configuration in Cloudflare dashboard

Your current setup is pointing to a private IP (`https://192.168.0.122:3001`), which won't work because the Cloudflare tunnel runs **inside Docker** and needs to connect to services by their **internal Docker names**.

### Correct Configuration

**In Cloudflare Zero Trust Dashboard:**

1. Go to **Networks → Tunnels**
2. Select your tunnel
3. Click **Configure**
4. Under **Public Hostnames**, set:

```
Subdomain: recipes
Domain: surajsubramanian.com
Type: HTTP
URL: http://frontend:3000      ← Internal Docker service name & port
```

Optional API endpoint:
```
Subdomain: recipes-api
Domain: surajsubramanian.com
Type: HTTP
URL: http://backend:8000       ← Internal Docker service name & port
```

**In your `.env`:**
```bash
CLOUDFLARE_TUNNEL_TOKEN=<your-token>
NEXT_PUBLIC_BACKEND_URL=https://recipes-api.surajsubramanian.com
CORS_ORIGINS=https://recipes.surajsubramanian.com,http://localhost:3000
```

**Then restart:**
```bash
docker compose restart cloudflared frontend backend
```

**Key Point**: Don't point to IP addresses—point to Docker service names:
- `frontend:3000` (not `192.168.0.122:3001`)
- `backend:8000` (not an IP)

---

## 3. Unit Conversion (Original/Metric/Imperial)

**Files**:
- `frontend/src/lib/utils.ts` — New unit conversion functions
- `frontend/src/components/IngredientChecklist.tsx` — Updated to support units
- `frontend/src/app/recipe/[id]/page.tsx` — Added unit selector UI

### How It Works

On the recipe detail page, below the servings scaler, you'll now see unit conversion buttons:

```
Units
[Original] [Metric] [Imperial]
```

Click any button to convert all ingredient amounts and units:

**Example conversions:**
- Original: `1 cup flour` → Metric: `240 g flour` → Imperial: `8.5 oz flour`
- Original: `2 tbsp butter` → Metric: `30 ml butter` → Imperial: `1 fl oz butter`
- Original: `500 g pasta` → Imperial: `17.6 oz pasta`

### Supported Units

**Metric**:
- Weight: g, gram, kg, kilogram
- Volume: ml, l, cup, tsp, tbsp, fl oz

**Imperial**:
- Weight: oz, ounce, lb, pound
- Volume: tsp, tbsp, cup, fl oz, pint, quart

**Conversion Accuracy**:
- Metric converts to grams (weight) or ml (volume)
- Imperial converts to oz (weight) or fl oz (volume)
- Displays up to 1-2 decimal places for readability

### Implementation Details

New function in `utils.ts`:
```typescript
convertUnit(amount: number, originalUnit: string, toSystem: UnitSystem): UnitConversion
```

Returns:
```typescript
{ amount: number, unit: string }
```

The component tries to match units intelligently—if exact match isn't found, returns original unchanged.

---

## 4. Source Icons on Recipe Cards

**Files**:
- `frontend/src/components/RecipeCard.tsx` — Added source badge

### Visual Indicator

Each recipe card now shows a small icon in the top-right corner:

- **YouTube icon** (▶️ red): Recipe imported from a YouTube video
- **Globe icon** (🌐 blue): Recipe scraped from a website

### Technical Details

**YouTube Detection**:
Uses the existing `isYouTubeUrl()` helper to detect:
- youtube.com
- youtu.be
- m.youtube.com

**Styling**:
- Icon badge positioned in top-right of recipe image
- Semi-transparent background with backdrop blur
- Hover tooltip shows "From YouTube" or "From website"

---

## Testing All Features

### Test Back Button
1. Go to `http://localhost:3001/recipes`
2. Click any recipe card
3. Click "Back" button
4. Should navigate to `/recipes`

### Test Unit Conversion
1. Open a recipe with ingredients
2. Scroll to "Units" section
3. Click "Metric" → units convert to grams/ml
4. Click "Imperial" → units convert to oz/fl oz
5. Click "Original" → back to original units
6. Change servings while in different unit system → conversions apply

### Test Source Icons
1. Go to recipes list
2. Look for recipes with different sources:
   - YouTube videos → Red play icon (▶️)
   - Website recipes → Blue globe icon (🌐)
3. Hover over icons to see tooltip

### Test Cloudflare (After Configuration)
1. Update Cloudflare tunnel config with correct Docker service names
2. Restart services: `docker compose restart cloudflared frontend backend`
3. Wait 30 seconds for tunnel to establish
4. Access: `https://recipes.surajsubramanian.com`
5. Check logs: `docker compose logs cloudflared`

---

## Troubleshooting

### Unit Conversion Not Working
- Ensure units are in the supported list (see above)
- Check browser console for errors
- Unsupported units return unchanged

### Back Button Goes to Wrong Place
- Make sure the file was updated correctly
- Clear browser cache (Ctrl+Shift+Delete)
- Restart frontend: `docker compose restart frontend`

### Cloudflare Still Not Working
- Check tunnel status: `docker compose logs cloudflared | tail -20`
- Verify service names are correct (not IPs):
  - `http://frontend:3000` ✅
  - `http://backend:8000` ✅
  - `https://192.168.0.122:3000` ❌
- Restart tunnel: `docker compose restart cloudflared`

### Source Icons Not Showing
- Ensure recipes have `source_url` field
- Check DevTools to confirm URLs are being loaded
- Try browser refresh

---

## Files Modified

| File | Changes |
|------|---------|
| `frontend/src/app/recipe/[id]/page.tsx` | Back button, unit selector UI |
| `frontend/src/components/RecipeCard.tsx` | Source icons |
| `frontend/src/components/IngredientChecklist.tsx` | Unit conversion support |
| `frontend/src/lib/utils.ts` | Unit conversion functions |

## No Database Changes

✅ No migrations needed
✅ No API changes
✅ All new features are frontend-only
