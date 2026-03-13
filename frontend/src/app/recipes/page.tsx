"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";
import { recipesApi } from "@/lib/api";
import type { PaginatedRecipes, Tag } from "@/lib/types";
import { RecipeCard, RecipeCardSkeleton } from "@/components/RecipeCard";
import { SearchBar } from "@/components/SearchBar";
import { TagFilter } from "@/components/TagFilter";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/lib/hooks";

const PAGE_SIZE = 12;

export default function RecipesPage() {
  const { getToken } = useAuth();
  const [data, setData] = useState<PaginatedRecipes | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [search, setSearch] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const debouncedSearch = useDebounce(search, 350);

  const fetchRecipes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const result = await recipesApi.list(
        {
          page,
          page_size: PAGE_SIZE,
          search: debouncedSearch || undefined,
          tag: selectedTag || undefined,
        },
        token
      );
      setData(result);
    } catch (e) {
      setError("Failed to load recipes.");
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, selectedTag]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch tags once
  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        setTags(await recipesApi.tags(token));
      } catch {
        // non-critical
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, selectedTag]);

  useEffect(() => {
    fetchRecipes();
  }, [fetchRecipes]);

  return (
    <div className="px-safe mx-auto max-w-5xl px-4 pt-6">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Recipes</h1>
        {data && (
          <span className="text-sm text-muted-foreground">
            {data.total} recipe{data.total !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Search */}
      <SearchBar
        value={search}
        onChange={setSearch}
        className="mb-3"
      />

      {/* Tag filter */}
      {tags.length > 0 && (
        <TagFilter
          tags={tags}
          selected={selectedTag}
          onChange={setSelectedTag}
          className="mb-4"
        />
      )}

      {/* Error */}
      {error && (
        <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </p>
      )}

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: PAGE_SIZE }).map((_, i) => (
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
          <span className="mb-3 text-6xl" role="img" aria-label="empty">
            🍽️
          </span>
          <p className="text-lg font-semibold text-foreground">No recipes yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {search || selectedTag
              ? "Try clearing the filters"
              : 'Tap "Add" to import your first recipe'}
          </p>
        </div>
      )}

      {/* Pagination */}
      {data && data.pages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2 pb-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
            aria-label="Previous page"
          >
            <ChevronLeftIcon className="h-4 w-4" aria-hidden="true" />
          </button>

          {Array.from({ length: data.pages }, (_, i) => i + 1)
            .filter(
              (p) => p === 1 || p === data.pages || Math.abs(p - page) <= 1
            )
            .reduce<(number | "…")[]>((acc, p, i, arr) => {
              if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("…");
              acc.push(p);
              return acc;
            }, [])
            .map((p, i) =>
              p === "…" ? (
                <span key={`ellipsis-${i}`} className="px-1 text-muted-foreground">
                  …
                </span>
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
            onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
            disabled={page === data.pages}
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
