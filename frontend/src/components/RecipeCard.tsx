"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { cn, formatCookTime, totalTime, isYouTubeUrl } from "@/lib/utils";
import type { RecipeSummary } from "@/lib/types";
import { ClockIcon, FireIcon, GlobeAltIcon } from "@heroicons/react/24/outline";

interface RecipeCardProps {
  recipe: RecipeSummary;
  className?: string;
}

export function RecipeCard({ recipe, className }: RecipeCardProps) {
  const time = totalTime(recipe.prep_time_minutes, recipe.cook_time_minutes);

  return (
    <Link
      href={`/recipe/${recipe.id}`}
      className={cn(
        "group flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10",
        className
      )}
    >
      {/* Image */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
        {recipe.image_url ? (
          <Image
            src={recipe.image_url}
            alt={recipe.title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <span className="text-5xl" role="img" aria-label="recipe">
              🍽️
            </span>
          </div>
        )}
        {/* Difficulty badge */}
        {recipe.difficulty && (
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
        )}

        {/* Source badge */}
        {recipe.source_url && (
          <span
            className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-card/80 backdrop-blur-sm"
            title={isYouTubeUrl(recipe.source_url) ? "From YouTube" : "From website"}
          >
            {isYouTubeUrl(recipe.source_url) ? (
              <YoutubeIcon />
            ) : (
              <FaviconIcon url={recipe.source_url} />
            )}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-2 p-3">
        <h2 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground group-hover:text-primary">
          {recipe.title}
        </h2>

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {time && (
            <span className="flex items-center gap-1">
              <ClockIcon className="h-3.5 w-3.5" aria-hidden="true" />
              {time}
            </span>
          )}
          {recipe.servings && (
            <span className="flex items-center gap-1">
              <FireIcon className="h-3.5 w-3.5" aria-hidden="true" />
              {recipe.servings} serving{recipe.servings !== 1 ? "s" : ""}
            </span>
          )}
          {recipe.cuisine && (
            <span className="capitalize">{recipe.cuisine}</span>
          )}
        </div>

        {/* Tags */}
        {recipe.tags.length > 0 && (
          <div className="mt-auto flex flex-wrap gap-1 pt-1">
            {recipe.tags.slice(0, 4).map((tag) => (
              <span
                key={tag.id}
                className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"
              >
                {tag.name}
              </span>
            ))}
            {recipe.tags.length > 4 && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                +{recipe.tags.length - 4}
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}

export function RecipeCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <div className="skeleton aspect-[4/3] w-full" />
      <div className="flex flex-col gap-2 p-3">
        <div className="skeleton h-4 w-3/4 rounded" />
        <div className="skeleton h-3 w-1/2 rounded" />
        <div className="flex gap-1 pt-1">
          <div className="skeleton h-5 w-12 rounded-full" />
          <div className="skeleton h-5 w-16 rounded-full" />
        </div>
      </div>
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
      // Try multiple favicon sources
      const favicon = `${domain}/favicon.ico`;
      setFaviconUrl(favicon);
    } catch {
      // Fallback to globe icon if URL parsing fails
    }
  }, [url]);

  if (faviconUrl) {
    return (
      <img
        src={faviconUrl}
        alt="Website favicon"
        className="h-4 w-4"
        onError={() => <GlobeAltIcon className="h-4 w-4 text-blue-400" aria-hidden="true" />}
      />
    );
  }

  return <GlobeAltIcon className="h-4 w-4 text-blue-400" aria-hidden="true" />;
}
