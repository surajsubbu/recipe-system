"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { cn, formatCookTime, totalTime, isYouTubeUrl } from "@/lib/utils";
import type { RecipeSummary } from "@/lib/types";
import { ClockIcon, GlobeAltIcon } from "@heroicons/react/24/outline";

interface RecipeCardProps {
  recipe: RecipeSummary;
  className?: string;
  matchPercentage?: number; // 0–100, shown as green badge when provided
}

export function RecipeCard({ recipe, className, matchPercentage }: RecipeCardProps) {
  const time = totalTime(recipe.prep_time_minutes, recipe.cook_time_minutes);
  const firstTag = recipe.tags[0];

  return (
    <Link
      href={`/recipe/${recipe.id}`}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10",
        className
      )}
    >
      {/* Portrait image container */}
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-muted">
        {recipe.image_url ? (
          <Image
            src={recipe.image_url}
            alt={recipe.title}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <span className="text-5xl" role="img" aria-label="recipe">
              🍽️
            </span>
          </div>
        )}

        {/* Gradient overlay — title sits on this */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

        {/* Match % badge (top-left) — shown instead of difficulty when provided */}
        {matchPercentage !== undefined ? (
          <span className="absolute left-2 top-2 rounded-full bg-success/90 px-2 py-0.5 text-xs font-semibold text-success-foreground backdrop-blur-sm">
            {Math.round(matchPercentage)}% match
          </span>
        ) : recipe.difficulty ? (
          <span
            className={cn(
              "absolute left-2 top-2 rounded-full px-2 py-0.5 text-xs font-semibold backdrop-blur-sm",
              recipe.difficulty.toLowerCase() === "easy" &&
                "bg-green-900/70 text-green-300",
              recipe.difficulty.toLowerCase() === "medium" &&
                "bg-yellow-900/70 text-yellow-300",
              recipe.difficulty.toLowerCase() === "hard" &&
                "bg-red-900/70 text-red-300",
              !["easy", "medium", "hard"].includes(
                recipe.difficulty.toLowerCase()
              ) && "bg-card/70 text-muted-foreground"
            )}
          >
            {recipe.difficulty}
          </span>
        ) : null}

        {/* Cook time pill (top-right) */}
        {time && (
          <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/50 px-2 py-0.5 text-xs text-white backdrop-blur-sm">
            <ClockIcon className="h-3 w-3" aria-hidden="true" />
            {time}
          </span>
        )}

        {/* Title on gradient overlay (bottom) */}
        <h2 className="absolute bottom-3 left-3 right-3 line-clamp-2 text-sm font-bold leading-snug text-white">
          {recipe.title}
        </h2>

        {/* Single tag pill (bottom-right, above title) */}
        {firstTag && (
          <span className="absolute bottom-10 right-3 rounded-full bg-primary/80 px-2 py-0.5 text-xs text-white backdrop-blur-sm">
            {firstTag.name}
          </span>
        )}
      </div>
    </Link>
  );
}

export function RecipeCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <div className="skeleton aspect-[3/4] w-full" />
    </div>
  );
}

// ─── Icon components ──────────────────────────────────────────────────────────

function YoutubeIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      style={{ color: "#ef4444" }}
    >
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

function FaviconIcon({ url }: { url: string }) {
  const [faviconUrl, setFaviconUrl] = React.useState<string>("");

  React.useEffect(() => {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.origin;
      setFaviconUrl(`${domain}/favicon.ico`);
    } catch {
      // ignore
    }
  }, [url]);

  if (faviconUrl) {
    return (
      <img
        src={faviconUrl}
        alt="Website favicon"
        className="h-4 w-4"
        onError={() => setFaviconUrl("")}
      />
    );
  }

  return <GlobeAltIcon className="h-4 w-4 text-blue-400" aria-hidden="true" />;
}

// Exported for use in source badge contexts if needed
export { YoutubeIcon, FaviconIcon };
