import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// ─── Tailwind class merging ───────────────────────────────────────────────────

/**
 * Merge Tailwind classes safely, resolving conflicts.
 * Usage: cn("px-4 py-2", isActive && "bg-primary", className)
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

// ─── Time formatting ─────────────────────────────────────────────────────────

/**
 * Format cook/prep time in minutes to a human-readable string.
 * Examples:
 *   5   → "5 min"
 *   60  → "1 hr"
 *   90  → "1 hr 30 min"
 *   125 → "2 hr 5 min"
 */
export function formatCookTime(minutes: number | null | undefined): string {
  if (minutes == null || minutes <= 0) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m} min`;
}

/**
 * Total time = prep + cook (skips null values).
 */
export function totalTime(
  prep: number | null | undefined,
  cook: number | null | undefined
): string {
  const total = (prep ?? 0) + (cook ?? 0);
  return formatCookTime(total || null);
}

// ─── Timer formatting ─────────────────────────────────────────────────────────

/**
 * Format seconds into MM:SS string.
 * Examples: 90 → "1:30", 3600 → "60:00"
 */
export function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ─── Date formatting ─────────────────────────────────────────────────────────

/**
 * Format ISO date string (or Date) to locale date.
 * Example: "2024-10-15T10:30:00Z" → "Oct 15, 2024"
 */
export function formatDate(
  value: string | Date | null | undefined,
  opts: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
  }
): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, opts);
}

/**
 * Return the ISO date string (YYYY-MM-DD) for the Monday of a given week.
 * Defaults to the current week.
 */
export function weekMonday(from: Date = new Date()): string {
  const d = new Date(from);
  const day = d.getDay(); // 0=Sun, 1=Mon … 6=Sat
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

/**
 * Add `days` to a YYYY-MM-DD string and return new YYYY-MM-DD.
 */
export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Short weekday label from YYYY-MM-DD.
 * Example: "2024-10-14" → "Mon"
 */
export function shortWeekday(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
  });
}

// ─── Number helpers ───────────────────────────────────────────────────────────

/**
 * Scale an ingredient amount by a servings multiplier.
 * Keeps up to 2 decimal places; returns null if amount is null.
 */
export function scaleAmount(
  amount: number | null | undefined,
  multiplier: number
): number | null {
  if (amount == null) return null;
  const scaled = amount * multiplier;
  // Trim unnecessary trailing zeros
  return parseFloat(scaled.toFixed(2));
}

/**
 * Display an ingredient amount nicely.
 * null → "", 0.5 → "½", 0.25 → "¼", 0.75 → "¾", else numeric string
 */
const FRACTIONS: Record<number, string> = {
  0.25: "¼",
  0.5: "½",
  0.75: "¾",
  0.33: "⅓",
  0.67: "⅔",
  0.125: "⅛",
  0.375: "⅜",
  0.625: "⅝",
  0.875: "⅞",
};

export function displayAmount(amount: number | null | undefined): string {
  if (amount == null) return "";
  const whole = Math.floor(amount);
  const frac = parseFloat((amount - whole).toFixed(3));
  const fracStr = FRACTIONS[frac] ?? (frac > 0 ? frac.toString() : "");
  if (whole === 0) return fracStr || "0";
  return fracStr ? `${whole} ${fracStr}` : `${whole}`;
}

// ─── String helpers ───────────────────────────────────────────────────────────

/**
 * Capitalise first letter of a string.
 */
export function capitalize(str: string): string {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Truncate text to `maxLength` chars with ellipsis.
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + "…";
}

/**
 * Return true if a string looks like a YouTube URL.
 */
export function isInstagramUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    return (
      hostname === "instagram.com" ||
      hostname === "m.instagram.com" ||
      hostname === "instagr.am"
    );
  } catch {
    return false;
  }
}

export function isYouTubeUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    return (
      hostname === "youtube.com" ||
      hostname === "youtu.be" ||
      hostname === "m.youtube.com"
    );
  } catch {
    return false;
  }
}

/**
 * Extract the YouTube video ID from a URL.
 * Handles youtube.com/watch?v=ID, youtu.be/ID, youtube.com/shorts/ID, etc.
 * Returns null if the ID cannot be determined.
 */
export function getYouTubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      return parsed.pathname.slice(1) || null;
    }
    if (host === "youtube.com" || host === "m.youtube.com") {
      const v = parsed.searchParams.get("v");
      if (v) return v;
      // /shorts/ID or /live/ID
      const match = parsed.pathname.match(/\/(?:shorts|live|embed)\/([^/?]+)/);
      if (match) return match[1];
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Difficulty badge colour ──────────────────────────────────────────────────

export function difficultyColor(
  difficulty: string | null | undefined
): string {
  switch (difficulty?.toLowerCase()) {
    case "easy":
      return "text-green-400";
    case "medium":
      return "text-yellow-400";
    case "hard":
      return "text-red-400";
    default:
      return "text-muted";
  }
}

// ─── Pantry staples detection ─────────────────────────────────────────────────

/**
 * Common household pantry staples that are almost always on hand.
 * Matched against normalized_name or lowercased name.
 * Intentionally narrow — pasta, canned tomatoes, rice are NOT included
 * even though they're in the "pantry" category.
 */
const STAPLE_NAMES = new Set([
  "water", "salt", "black pepper", "pepper", "white pepper",
  "oil", "olive oil", "vegetable oil", "canola oil", "sunflower oil",
  "butter", "sugar", "brown sugar", "powdered sugar", "icing sugar",
  "flour", "all-purpose flour", "baking soda", "baking powder",
  "vinegar", "soy sauce",
]);

export function isIngredientStaple(ing: { normalized_name?: string | null; name: string }): boolean {
  const name = (ing.normalized_name ?? ing.name).toLowerCase().trim();
  return STAPLE_NAMES.has(name);
}

// ─── Ingredient emoji icons ───────────────────────────────────────────────────

const INGREDIENT_NAME_EMOJIS: Record<string, string> = {
  // Vegetables
  "onion": "🧅", "garlic": "🧄", "tomato": "🍅", "carrot": "🥕",
  "potato": "🥔", "bell pepper": "🫑", "pepper": "🌶️", "lettuce": "🥬",
  "spinach": "🥬", "mushroom": "🍄", "corn": "🌽", "broccoli": "🥦",
  "cucumber": "🥒", "avocado": "🥑", "eggplant": "🍆", "celery": "🌿",
  "zucchini": "🥒", "kale": "🥬", "cabbage": "🥬", "pea": "🫛",
  // Fruits
  "lemon": "🍋", "lime": "🍋", "orange": "🍊", "apple": "🍎",
  "banana": "🍌", "strawberry": "🍓", "blueberry": "🫐", "mango": "🥭",
  "pineapple": "🍍", "grape": "🍇", "cherry": "🍒", "coconut": "🥥",
  // Proteins
  "chicken": "🍗", "beef": "🥩", "pork": "🥩", "lamb": "🥩",
  "salmon": "🐟", "tuna": "🐟", "shrimp": "🦐", "egg": "🥚",
  "tofu": "🫘", "bacon": "🥓",
  // Dairy
  "milk": "🥛", "cheese": "🧀", "butter": "🧈", "cream": "🥛",
  "yogurt": "🥛", "parmesan": "🧀", "mozzarella": "🧀",
  // Grains / Pantry
  "flour": "🌾", "sugar": "🍬", "salt": "🧂", "rice": "🍚",
  "pasta": "🍝", "bread": "🍞", "olive oil": "🫒", "oil": "🫒",
  "honey": "🍯", "vanilla": "🫙", "chocolate": "🍫", "cocoa": "🍫",
  // Herbs / Spices
  "basil": "🌿", "parsley": "🌿", "cilantro": "🌿", "thyme": "🌿",
  "rosemary": "🌿", "oregano": "🌿", "ginger": "🫚", "cinnamon": "🫚",
  "cumin": "🫚", "paprika": "🫚", "chili": "🌶️", "turmeric": "🫚",
  // Liquids
  "water": "💧", "wine": "🍷", "beer": "🍺", "broth": "🍲",
  "stock": "🍲", "vinegar": "🍶", "soy sauce": "🥢", "lemon juice": "🍋",
  // Nuts / Seeds
  "almond": "🌰", "walnut": "🌰", "peanut": "🥜", "sesame": "🌱",
  "cashew": "🌰", "pecan": "🌰",
  // Beans / Legumes
  "bean": "🫘", "lentil": "🫘", "chickpea": "🫘",
};

const CATEGORY_EMOJIS: Record<string, string> = {
  "produce": "🥕",
  "dairy": "🥛",
  "meat": "🥩",
  "seafood": "🐟",
  "pantry": "🫙",
  "spices": "🧂",
  "bakery": "🍞",
  "frozen": "🧊",
  "beverages": "🥤",
  "condiments": "🥫",
  "other": "🥄",
};

export function getIngredientEmoji(name: string, category?: string | null): string {
  const nameLower = name.toLowerCase();
  for (const [key, emoji] of Object.entries(INGREDIENT_NAME_EMOJIS)) {
    if (nameLower.includes(key)) return emoji;
  }
  if (category && CATEGORY_EMOJIS[category]) {
    return CATEGORY_EMOJIS[category];
  }
  return "🥄";
}

// ─── Ingredient image (TheMealDB CDN) ────────────────────────────────────────

/**
 * Return a TheMealDB ingredient image URL for a normalized ingredient name.
 * Example: "olive oil" → "https://www.themealdb.com/images/ingredients/Olive%20Oil-Small.png"
 * Returns null if normalizedName is empty/null.
 */
export function getIngredientImageUrl(normalizedName?: string | null): string | null {
  if (!normalizedName) return null;
  const name = normalizedName
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  return `https://www.themealdb.com/images/ingredients/${encodeURIComponent(name)}-Small.png`;
}

// ─── Unit conversion (Original/Metric/Imperial) ────────────────────────────────

export type UnitSystem = "original" | "metric" | "imperial";

interface UnitConversion {
  amount: number;
  unit: string;
}

// Volume units — used to determine whether metric output should be ml vs g
const VOLUME_UNITS = new Set([
  "tsp", "teaspoon", "teaspoons",
  "tbsp", "tablespoon", "tablespoons",
  "fl oz", "fl.oz", "fluid ounce",
  "cup", "cups", "c",
  "ml", "milliliter", "milliliters",
  "l", "liter", "liters",
  "pint", "quart",
]);

// Metric conversions (common cooking units to grams/ml)
const METRIC_CONVERSIONS: Record<string, number> = {
  // Weight (to grams)
  "oz": 28.35, "ounce": 28.35, "ounces": 28.35,
  "lb": 453.6, "lbs": 453.6, "pound": 453.6, "pounds": 453.6,
  "g": 1, "gram": 1, "grams": 1, "kg": 1000, "kilogram": 1000,

  // Volume (to ml)
  "tsp": 5, "teaspoon": 5, "teaspoons": 5,
  "tbsp": 15, "tablespoon": 15, "tablespoons": 15,
  "fl oz": 30, "fl.oz": 30, "fluid ounce": 30,
  "cup": 240, "cups": 240, "c": 240,
  "ml": 1, "milliliter": 1, "milliliters": 1,
  "l": 1000, "liter": 1000, "liters": 1000,
  "pint": 473, "quart": 946,
};

// Imperial conversions (metric back to imperial)
const IMPERIAL_CONVERSIONS: Record<string, number> = {
  // Weight (from grams)
  "g": 0.0353, "gram": 0.0353, "grams": 0.0353,
  "kg": 2.205, "kilogram": 2.205,

  // Volume (from ml)
  "ml": 0.0338, "milliliter": 0.0338, "milliliters": 0.0338,
  "l": 33.814, "liter": 33.814, "liters": 33.814,
};

/**
 * Convert ingredient unit from one system to another.
 * Attempts to convert common cooking units.
 * Returns original if conversion not possible.
 */
export function convertUnit(
  amount: number | null | undefined,
  originalUnit: string,
  toSystem: UnitSystem
): UnitConversion {
  if (amount == null || !originalUnit) {
    return { amount, unit: originalUnit };
  }

  const unit = originalUnit.toLowerCase().trim();

  if (toSystem === "original") {
    return { amount, unit: originalUnit };
  }

  if (toSystem === "metric") {
    // Try to convert to metric (grams or ml)
    const factor = METRIC_CONVERSIONS[unit];
    if (factor) {
      return {
        amount: parseFloat((amount * factor).toFixed(1)),
        unit: VOLUME_UNITS.has(unit) ? "ml" : "g",
      };
    }
  }

  if (toSystem === "imperial") {
    // Try to convert to imperial (oz or fl oz)
    const factor = IMPERIAL_CONVERSIONS[unit];
    if (factor) {
      return {
        amount: parseFloat((amount * factor).toFixed(2)),
        unit: VOLUME_UNITS.has(unit) ? "fl oz" : "oz",
      };
    }
  }

  // No conversion found, return original
  return { amount, unit: originalUnit };
}
