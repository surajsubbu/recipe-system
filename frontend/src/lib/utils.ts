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
