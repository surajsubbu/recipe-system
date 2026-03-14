"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { collectionsApi, recipesApi } from "@/lib/api";
import type { Collection, PaginatedRecipes, RecipeSummary } from "@/lib/types";
import { RecipeCard, RecipeCardSkeleton } from "@/components/RecipeCard";
import { ArrowLeftIcon, MagnifyingGlassIcon, PlusIcon } from "@heroicons/react/24/outline";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/lib/hooks";

const PAGE_SIZE = 12;

export default function CollectionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { getToken } = useAuth();

  const [collection, setCollection] = useState<Collection | null>(null);
  const [data, setData] = useState<PaginatedRecipes | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Inline add search
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 400);
  const [searchResults, setSearchResults] = useState<RecipeSummary[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [addedIds, setAddedIds] = useState<Set<number>>(new Set());
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  async function load() {
    setLoading(true);
    try {
      const token = await getToken();
      const [colData, recipesData] = await Promise.all([
        collectionsApi.get(Number(id), token),
        collectionsApi.listRecipes(Number(id), token, page, PAGE_SIZE),
      ]);
      setCollection(colData);
      setData(recipesData);
    } catch {
      setError("Failed to load collection.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  // Search recipes for inline add
  useEffect(() => {
    if (!debouncedSearch.trim()) {
      setSearchResults([]);
      return;
    }
    (async () => {
      setSearchLoading(true);
      try {
        const token = await getToken();
        const result = await recipesApi.list({ search: debouncedSearch, page_size: 5 }, token);
        setSearchResults(result.items);
        setShowDropdown(true);
      } catch {
        // ignore
      } finally {
        setSearchLoading(false);
      }
    })();
  }, [debouncedSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function addRecipeToCollection(recipeId: number) {
    try {
      const token = await getToken();
      await collectionsApi.addRecipe(Number(id), recipeId, token);
      setAddedIds((prev) => new Set([...prev, recipeId]));
      // Refresh recipe list after adding
      await load();
    } catch {
      // ignore — duplicate adds are expected and OK
    }
  }

  const pages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  return (
    <div className="pb-nav px-safe mx-auto max-w-5xl px-4 pt-6">
      {/* Back nav */}
      <button
        onClick={() => router.push("/collections")}
        className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
        Collections
      </button>

      {/* Hero header */}
      {collection ? (
        collection.cover_image_url ? (
          <div className="relative mb-6 aspect-[16/7] w-full overflow-hidden rounded-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={collection.cover_image_url}
              alt={collection.name}
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
            <div className="absolute bottom-4 left-4">
              <h1 className="text-2xl font-bold text-white">{collection.name}</h1>
              {data && (
                <p className="text-sm text-white/70">
                  {data.total} recipe{data.total !== 1 ? "s" : ""}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/30 to-accent">
              <span className="text-2xl font-bold text-foreground/60 uppercase">
                {collection.name[0]}
              </span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">{collection.name}</h1>
              {data && (
                <p className="text-sm text-muted-foreground">
                  {data.total} recipe{data.total !== 1 ? "s" : ""}
                </p>
              )}
            </div>
          </div>
        )
      ) : (
        <div className="mb-6 h-10 w-48 animate-pulse rounded-xl bg-muted" />
      )}

      {/* Inline recipe search + add */}
      <div ref={searchRef} className="relative mb-6">
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
          <MagnifyingGlassIcon className="h-4 w-4 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
            placeholder="Search recipes to add…"
            className="flex-1 bg-transparent text-sm text-foreground placeholder-muted-foreground focus:outline-none"
          />
          {searchLoading && (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          )}
        </div>

        {showDropdown && searchResults.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
            {searchResults.map((recipe) => (
              <div
                key={recipe.id}
                className="flex items-center justify-between px-4 py-2.5 hover:bg-accent"
              >
                <span className="text-sm text-foreground line-clamp-1">{recipe.title}</span>
                <button
                  onClick={() => addRecipeToCollection(recipe.id)}
                  className={cn(
                    "ml-3 flex-shrink-0 rounded-lg px-2 py-1 text-xs font-semibold transition-colors",
                    addedIds.has(recipe.id)
                      ? "bg-success/20 text-success"
                      : "bg-primary/10 text-primary hover:bg-primary/20"
                  )}
                >
                  {addedIds.has(recipe.id) ? "✓ Added" : <><PlusIcon className="inline h-3 w-3 mr-0.5" />Add</>}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </p>
      )}

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <RecipeCardSkeleton key={i} />
          ))}
        </div>
      ) : data && data.items.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {data.items.map((r) => (
            <RecipeCard key={r.id} recipe={r} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/30 to-accent">
            <span className="text-3xl">📖</span>
          </div>
          <p className="text-lg font-semibold text-foreground">No recipes yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Search for recipes above to add them here
          </p>
          <Link
            href="/recipes"
            className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            Browse Recipes
          </Link>
        </div>
      )}

      {/* Pagination */}
      {data && pages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2 pb-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
            aria-label="Previous page"
          >
            <ChevronLeftIcon className="h-4 w-4" aria-hidden="true" />
          </button>

          {Array.from({ length: pages }, (_, i) => i + 1)
            .filter((p) => p === 1 || p === pages || Math.abs(p - page) <= 1)
            .reduce<(number | "…")[]>((acc, p, i, arr) => {
              if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("…");
              acc.push(p);
              return acc;
            }, [])
            .map((p, i) =>
              p === "…" ? (
                <span key={`ellipsis-${i}`} className="px-1 text-muted-foreground">…</span>
              ) : (
                <button
                  key={p}
                  onClick={() => setPage(p as number)}
                  className={cn(
                    "h-10 w-10 rounded-xl text-sm font-medium transition-colors",
                    page === p
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-card text-muted-foreground hover:text-foreground"
                  )}
                  aria-label={`Page ${p}`}
                  aria-current={page === p ? "page" : undefined}
                >
                  {p}
                </button>
              )
            )}

          <button
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
            disabled={page === pages}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
            aria-label="Next page"
          >
            <ChevronRightIcon className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
