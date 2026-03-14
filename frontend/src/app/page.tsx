"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth, useUser } from "@clerk/nextjs";
import { recipesApi, pantryApi } from "@/lib/api";
import type { RecipeSummary } from "@/lib/types";
import { RecipeCard, RecipeCardSkeleton } from "@/components/RecipeCard";
import { BeakerIcon } from "@heroicons/react/24/outline";

const CUISINES = [
  { label: "🍝 Italian", q: "italian" },
  { label: "🍜 Asian", q: "asian" },
  { label: "🌮 Mexican", q: "mexican" },
  { label: "🫕 Indian", q: "indian" },
  { label: "🥗 Healthy", q: "healthy" },
  { label: "⚡ Quick", q: "quick" },
];

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function HomePage() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const [recipes, setRecipes] = useState<RecipeSummary[]>([]);
  const [pantryCount, setPantryCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        const [recipeData, pantryData] = await Promise.all([
          recipesApi.list({ page: 1, page_size: 6 }, token),
          pantryApi.list(token),
        ]);
        setRecipes(recipeData.items);
        const count = Object.values(pantryData).reduce(
          (sum, items) => sum + items.length,
          0
        );
        setPantryCount(count);
      } catch {
        // silently ignore — pages still render with defaults
      } finally {
        setLoading(false);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const firstName = user?.firstName ?? user?.username ?? null;

  return (
    <div className="pb-nav px-4 pt-6 mx-auto max-w-3xl">
      {/* ── Greeting ─────────────────────────────────────────────────── */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {greeting()}{firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">What are you cooking today?</p>
        </div>
        {user?.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.imageUrl}
            alt={user.fullName ?? "Avatar"}
            className="h-10 w-10 rounded-full object-cover ring-2 ring-primary/30"
          />
        )}
      </div>

      {/* ── Cook from Pantry hero ─────────────────────────────────────── */}
      {pantryCount !== null && (
        pantryCount > 0 ? (
          <Link
            href="/pantry/cook"
            className="mb-6 flex items-center justify-between rounded-2xl bg-gradient-to-br from-primary/80 to-orange-600/60 p-5 transition-all hover:opacity-90 active:scale-[0.98]"
          >
            <div>
              <p className="text-lg font-bold text-white">What can I cook tonight?</p>
              <p className="mt-0.5 text-sm text-white/80">
                You have {pantryCount} item{pantryCount !== 1 ? "s" : ""} in your pantry
              </p>
            </div>
            <span className="ml-4 flex-shrink-0 rounded-xl bg-white/20 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm">
              Find Recipes →
            </span>
          </Link>
        ) : (
          <Link
            href="/pantry"
            className="mb-6 flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
          >
            <BeakerIcon className="h-6 w-6 flex-shrink-0 text-primary/60" aria-hidden="true" />
            <span>Add pantry items to find recipe matches</span>
            <span className="ml-auto text-primary">→</span>
          </Link>
        )
      )}

      {/* ── Browse by Cuisine ─────────────────────────────────────────── */}
      <div className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Browse by Cuisine
        </h2>
        <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
          {CUISINES.map(({ label, q }) => (
            <Link
              key={q}
              href={`/recipes?search=${encodeURIComponent(q)}`}
              className="flex-shrink-0 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/50 hover:text-primary"
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      {/* ── Recent Recipes ────────────────────────────────────────────── */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Recently Added
          </h2>
          <Link
            href="/recipes"
            className="text-xs font-medium text-primary hover:underline"
          >
            See all →
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <RecipeCardSkeleton key={i} />
            ))}
          </div>
        ) : recipes.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {recipes.map((recipe) => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                className="animate-fade-up"
              />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">No recipes yet.</p>
            <Link
              href="/add"
              className="mt-3 inline-block rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              Add your first recipe
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
