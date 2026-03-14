"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { recipesApi } from "@/lib/api";
import type { CookableRecipe } from "@/lib/types";
import { RecipeCard, RecipeCardSkeleton } from "@/components/RecipeCard";
import { ArrowLeftIcon, BeakerIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/utils";

const FILTERS = [
  { label: "All", min: 0 },
  { label: "75%+", min: 0.75 },
  { label: "50%+", min: 0.5 },
  { label: "25%+", min: 0.25 },
];

export default function CookFromPantryPage() {
  const { getToken } = useAuth();
  const [recipes, setRecipes] = useState<CookableRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pantryEmpty, setPantryEmpty] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        const data = await recipesApi.cookable(token, 50);
        if (data.length === 0) {
          // Could be empty pantry or no matches — check with a small heuristic
          setPantryEmpty(true);
        }
        setRecipes(data);
      } catch {
        setError("Failed to load cookable recipes.");
      } finally {
        setLoading(false);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = recipes.filter((r) => r.match_percentage >= filter);

  return (
    <div className="pb-nav mx-auto max-w-3xl px-4 pt-6">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/pantry"
          className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
          Pantry
        </Link>
        <h1 className="text-2xl font-bold text-foreground">What can I cook?</h1>
        {recipes.length > 0 && (
          <p className="mt-0.5 text-sm text-muted-foreground">
            {recipes.length} recipe{recipes.length !== 1 ? "s" : ""} match your pantry
          </p>
        )}
      </div>

      {/* Error */}
      {error && (
        <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </p>
      )}

      {/* Filter chips */}
      {!loading && recipes.length > 0 && (
        <div className="mb-5 flex gap-2 overflow-x-auto scrollbar-none pb-1">
          {FILTERS.map(({ label, min }) => (
            <button
              key={label}
              onClick={() => setFilter(min)}
              className={cn(
                "flex-shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
                filter === min
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/50"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <RecipeCardSkeleton key={i} />
          ))}
        </div>
      ) : pantryEmpty && recipes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <BeakerIcon className="mb-3 h-16 w-16 text-muted-foreground/30" aria-hidden="true" />
          <p className="text-lg font-semibold text-foreground">Your pantry is empty</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add ingredients you have on hand to find matching recipes
          </p>
          <Link
            href="/pantry"
            className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            Add Pantry Items
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-lg font-semibold text-foreground">No recipes at this threshold</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Try a lower match filter, or add more pantry items and recipes
          </p>
          <button
            onClick={() => setFilter(0)}
            className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            Show All Matches
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {filtered.map((recipe) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              matchPercentage={recipe.match_percentage * 100}
              className="animate-fade-up"
            />
          ))}
        </div>
      )}
    </div>
  );
}
