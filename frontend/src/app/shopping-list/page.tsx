"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";
import { shoppingApi, pantryApi } from "@/lib/api";
import type { ShoppingList, ShoppingItem, IngredientCategory } from "@/lib/types";
import { PageSpinner } from "@/components/LoadingSpinner";
import { cn, capitalize, getIngredientImageUrl, getIngredientEmoji } from "@/lib/utils";
import {
  TrashIcon,
  CheckIcon,
  ArchiveBoxArrowDownIcon,
} from "@heroicons/react/24/outline";

// Category display order
const CATEGORY_ORDER: IngredientCategory[] = [
  "produce",
  "meat",
  "seafood",
  "dairy",
  "bakery",
  "frozen",
  "pantry",
  "spices",
  "condiments",
  "beverages",
  "other",
];

const CATEGORY_ICONS: Record<IngredientCategory, string> = {
  produce: "🥦",
  dairy: "🧀",
  meat: "🥩",
  seafood: "🐟",
  pantry: "🫙",
  spices: "🧂",
  bakery: "🍞",
  frozen: "🧊",
  beverages: "🥤",
  condiments: "🥫",
  other: "🛒",
};

function groupByCategory(
  items: ShoppingItem[]
): Map<IngredientCategory | null, ShoppingItem[]> {
  const map = new Map<IngredientCategory | null, ShoppingItem[]>();
  for (const item of items) {
    const key = item.category;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return map;
}

function sortedCategories(
  grouped: Map<IngredientCategory | null, ShoppingItem[]>
): (IngredientCategory | null)[] {
  const cats = Array.from(grouped.keys());
  return cats.sort((a, b) => {
    const ai = a ? CATEGORY_ORDER.indexOf(a) : 999;
    const bi = b ? CATEGORY_ORDER.indexOf(b) : 999;
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
}

export default function ShoppingListPage() {
  const { getToken } = useAuth();
  const [list, setList] = useState<ShoppingList | null>(null);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addedToPantry, setAddedToPantry] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      setList(await shoppingApi.get(token));
    } catch {
      setError("Failed to load shopping list.");
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load();
  }, [load]);

  async function toggleItem(itemId: number, checked: boolean) {
    // Optimistic update
    setList((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((it) =>
              it.id === itemId ? { ...it, checked } : it
            ),
          }
        : prev
    );
    try {
      const token = await getToken();
      await shoppingApi.updateItem(itemId, { checked }, token);
    } catch {
      load(); // revert on error
    }
  }

  async function removeItem(itemId: number) {
    setList((prev) =>
      prev ? { ...prev, items: prev.items.filter((it) => it.id !== itemId) } : prev
    );
    try {
      const token = await getToken();
      await shoppingApi.removeItem(itemId, token);
    } catch {
      load();
    }
  }

  async function addToPantry(item: ShoppingItem) {
    if (addedToPantry.has(item.id)) return;
    try {
      const token = await getToken();
      await pantryApi.create(
        {
          normalized_name: item.name,
          quantity: item.amount ?? undefined,
          unit: item.unit ?? undefined,
          category: item.category ?? undefined,
        },
        token
      );
      setAddedToPantry((prev) => new Set(prev).add(item.id));
    } catch {
      // silently ignore — button stays interactive
    }
  }

  async function clearChecked() {
    if (!confirm("Remove all checked items?")) return;
    setClearing(true);
    try {
      const token = await getToken();
      setList(await shoppingApi.clearChecked(token));
    } catch {
      setError("Failed to clear items.");
    } finally {
      setClearing(false);
    }
  }

  async function clearAll() {
    if (!confirm("Remove ALL items from your shopping list?")) return;
    setClearing(true);
    try {
      const token = await getToken();
      await shoppingApi.clearAll(token);
      setList((prev) => prev ? { ...prev, items: [] } : prev);
    } catch {
      setError("Failed to clear items.");
    } finally {
      setClearing(false);
    }
  }

  if (loading) return <PageSpinner />;

  const items = list?.items ?? [];
  const checkedCount = items.filter((i) => i.checked).length;
  const grouped = groupByCategory(items);
  const categories = sortedCategories(grouped);

  return (
    <div className="px-safe mx-auto max-w-2xl px-4 pt-6">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Shopping List</h1>
          {items.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {checkedCount} of {items.length} checked
            </p>
          )}
        </div>
        {items.length > 0 && (
          <div className="flex gap-2">
            {checkedCount > 0 && (
              <button
                onClick={clearChecked}
                disabled={clearing}
                className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-red-500/50 hover:text-red-400 disabled:opacity-50"
              >
                <TrashIcon className="h-4 w-4" aria-hidden="true" />
                Clear checked
              </button>
            )}
            <button
              onClick={clearAll}
              disabled={clearing}
              className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-red-500/50 hover:text-red-400 disabled:opacity-50"
            >
              <TrashIcon className="h-4 w-4" aria-hidden="true" />
              Clear all
            </button>
          </div>
        )}
      </div>

      {error && (
        <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          {error}
        </p>
      )}

      {/* Empty state */}
      {items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <span className="mb-3 text-5xl" role="img" aria-label="empty cart">
            🛒
          </span>
          <p className="text-lg font-semibold text-foreground">List is empty</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Open a recipe and tap "Add to List"
          </p>
        </div>
      )}

      {/* Grouped items */}
      <div className="space-y-6 pb-8">
        {categories.map((cat) => {
          const catItems = grouped.get(cat)!;
          const allChecked = catItems.every((i) => i.checked);
          const icon =
            cat ? CATEGORY_ICONS[cat] ?? "🛒" : "🛒";

          return (
            <section key={cat ?? "other"}>
              <div className="mb-2 flex items-center gap-2">
                <span aria-hidden="true" className="text-lg">{icon}</span>
                <h2
                  className={cn(
                    "text-sm font-semibold capitalize",
                    allChecked ? "text-muted-foreground line-through" : "text-foreground"
                  )}
                >
                  {cat ? capitalize(cat) : "Other"}
                </h2>
                <span className="ml-auto text-xs text-muted-foreground">
                  {catItems.filter((i) => i.checked).length}/{catItems.length}
                </span>
              </div>

              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                {catItems.map((item) => (
                  <li key={item.id}>
                    <div className="flex items-center gap-3 px-4 py-3">
                      {/* Checkbox */}
                      <button
                        onClick={() => toggleItem(item.id, !item.checked)}
                        className={cn(
                          "flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 transition-colors",
                          item.checked
                            ? "border-primary bg-primary"
                            : "border-border"
                        )}
                        role="checkbox"
                        aria-checked={item.checked}
                        aria-label={`Toggle ${item.name}`}
                      >
                        {item.checked && (
                          <CheckIcon
                            className="h-3.5 w-3.5 text-primary-foreground"
                            aria-hidden="true"
                          />
                        )}
                      </button>

                      {/* Ingredient photo */}
                      {(() => {
                        const imgUrl = getIngredientImageUrl(item.name);
                        return imgUrl ? (
                          <>
                            <img
                              src={imgUrl}
                              alt=""
                              aria-hidden="true"
                              width={24}
                              height={24}
                              className="h-6 w-6 rounded-full object-cover flex-shrink-0"
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                                const sib = e.currentTarget.nextElementSibling as HTMLElement | null;
                                if (sib) sib.removeAttribute("hidden");
                              }}
                            />
                            <span aria-hidden="true" className="text-sm flex-shrink-0" hidden>
                              {getIngredientEmoji(item.name, item.category ?? undefined)}
                            </span>
                          </>
                        ) : (
                          <span aria-hidden="true" className="text-sm flex-shrink-0">
                            {getIngredientEmoji(item.name, item.category ?? undefined)}
                          </span>
                        );
                      })()}

                      {/* Text */}
                      <span
                        className={cn(
                          "min-w-0 flex-1 text-sm",
                          item.checked && "text-muted-foreground line-through"
                        )}
                      >
                        {item.amount != null && (
                          <span className="font-semibold">
                            {item.amount}
                            {item.unit ? ` ${item.unit} ` : " "}
                          </span>
                        )}
                        {item.name}
                      </span>

                      {/* Add to pantry */}
                      <button
                        onClick={() => addToPantry(item)}
                        disabled={addedToPantry.has(item.id)}
                        className={cn(
                          "flex h-8 w-auto flex-shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-medium transition-colors",
                          addedToPantry.has(item.id)
                            ? "text-green-400"
                            : "text-muted-foreground hover:text-primary"
                        )}
                        aria-label={`Add ${item.name} to pantry`}
                      >
                        {addedToPantry.has(item.id) ? (
                          <>
                            <CheckIcon className="h-4 w-4" aria-hidden="true" />
                            <span className="hidden sm:inline">Added</span>
                          </>
                        ) : (
                          <>
                            <ArchiveBoxArrowDownIcon className="h-4 w-4" aria-hidden="true" />
                            <span className="hidden sm:inline">Pantry</span>
                          </>
                        )}
                      </button>

                      {/* Remove */}
                      <button
                        onClick={() => removeItem(item.id)}
                        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-red-400"
                        aria-label={`Remove ${item.name}`}
                      >
                        <TrashIcon className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
