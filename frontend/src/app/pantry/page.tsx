"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { pantryApi } from "@/lib/api";
import type { PantryItem, PantryGrouped } from "@/lib/types";
import {
  BeakerIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon,
  ShoppingCartIcon,
  ArrowDownTrayIcon,
} from "@heroicons/react/24/outline";
import { cn } from "@/lib/utils";
import { PageSpinner } from "@/components/LoadingSpinner";

const CATEGORY_ICONS: Record<string, string> = {
  produce: "🥦",
  dairy: "🧀",
  meat: "🥩",
  seafood: "🐟",
  pantry: "🫙",
  spices: "🌶️",
  bakery: "🍞",
  frozen: "🧊",
  beverages: "🥤",
  condiments: "🫙",
  other: "📦",
};

// Sort items within a category so expiring-soon items appear first
function sortByExpiry(items: PantryItem[]): PantryItem[] {
  const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
  const soon = Date.now() + threeDaysMs;
  return [...items].sort((a, b) => {
    const aExpiring = a.expires_on && new Date(a.expires_on).getTime() <= soon;
    const bExpiring = b.expires_on && new Date(b.expires_on).getTime() <= soon;
    if (aExpiring && !bExpiring) return -1;
    if (!aExpiring && bExpiring) return 1;
    return 0;
  });
}

export default function PantryPage() {
  const { getToken } = useAuth();
  const [grouped, setGrouped] = useState<PantryGrouped>({});
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  // Add form state
  const [addName, setAddName] = useState("");
  const [addQty, setAddQty] = useState("");
  const [addUnit, setAddUnit] = useState("");
  const [addCategory, setAddCategory] = useState("");
  const [addExpiry, setAddExpiry] = useState("");
  const [adding, setAdding] = useState(false);

  async function load() {
    try {
      const token = await getToken();
      setGrouped(await pantryApi.list(token));
    } catch {
      setError("Failed to load pantry.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function addItem() {
    if (!addName.trim()) return;
    setAdding(true);
    try {
      const token = await getToken();
      const item = await pantryApi.create(
        {
          normalized_name: addName.trim().toLowerCase(),
          quantity: addQty ? parseFloat(addQty) : undefined,
          unit: addUnit.trim() || undefined,
          category: addCategory.trim() || undefined,
          expires_on: addExpiry || undefined,
        },
        token
      );
      setGrouped((prev) => {
        const cat = item.category || "other";
        return { ...prev, [cat]: [...(prev[cat] || []), item] };
      });
      setAddName("");
      setAddQty("");
      setAddUnit("");
      setAddCategory("");
      setAddExpiry("");
      setShowAdd(false);
    } catch {
      setError("Failed to add item.");
    } finally {
      setAdding(false);
    }
  }

  async function deleteItem(item: PantryItem) {
    try {
      const token = await getToken();
      await pantryApi.delete(item.id, token);
      setGrouped((prev) => {
        const cat = item.category || "other";
        const updated = (prev[cat] || []).filter((i) => i.id !== item.id);
        if (updated.length === 0) {
          const { [cat]: _, ...rest } = prev;
          return rest;
        }
        return { ...prev, [cat]: updated };
      });
    } catch {
      setError("Failed to delete item.");
    }
  }

  async function clearPantry() {
    if (!confirm("Clear all pantry items?")) return;
    try {
      const token = await getToken();
      await pantryApi.clear(token);
      setGrouped({});
    } catch {
      setError("Failed to clear pantry.");
    }
  }

  async function importFromShopping() {
    setImporting(true);
    try {
      const token = await getToken();
      await pantryApi.importFromShoppingList(token);
      await load();
    } catch {
      setError("Failed to import from shopping list.");
    } finally {
      setImporting(false);
    }
  }

  const totalItems = Object.values(grouped).reduce(
    (sum, items) => sum + items.length,
    0
  );
  const categoryCount = Object.keys(grouped).length;

  if (loading) return <PageSpinner />;

  return (
    <div className="pb-nav px-safe mx-auto max-w-2xl px-4 pt-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pantry</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {totalItems} item{totalItems !== 1 ? "s" : ""} across {categoryCount} categor{categoryCount !== 1 ? "ies" : "y"}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={importFromShopping}
            disabled={importing}
            className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary disabled:opacity-60"
            title="Import checked shopping list items"
          >
            <ArrowDownTrayIcon className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">{importing ? "Importing…" : "Import"}</span>
          </button>
          <button
            onClick={() => setShowAdd((v) => !v)}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground active:scale-95 transition-transform"
          >
            <PlusIcon className="h-4 w-4" aria-hidden="true" />
            Add Item
          </button>
        </div>
      </div>

      {/* Cook from Pantry CTA — shown when ≥3 items */}
      {totalItems >= 3 && (
        <Link
          href="/pantry/cook"
          className="mb-6 flex items-center justify-between rounded-2xl bg-gradient-to-r from-primary/20 to-orange-600/10 border border-primary/20 p-4 transition-colors hover:border-primary/40"
        >
          <div>
            <p className="text-sm font-semibold text-foreground">What can I cook tonight?</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Based on {totalItems} pantry item{totalItems !== 1 ? "s" : ""}
            </p>
          </div>
          <span className="ml-4 flex-shrink-0 rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
            Find Recipes →
          </span>
        </Link>
      )}

      {/* Add form */}
      {showAdd && (
        <div className="mb-6 animate-slide-up rounded-2xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Add Pantry Item</h2>
            <button onClick={() => setShowAdd(false)} className="text-muted-foreground hover:text-foreground">
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              placeholder="Ingredient name*"
              className="col-span-2 rounded-xl border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none"
              autoFocus
            />
            <input
              type="number"
              value={addQty}
              onChange={(e) => setAddQty(e.target.value)}
              placeholder="Quantity"
              className="rounded-xl border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none"
              min="0"
              step="any"
            />
            <input
              type="text"
              value={addUnit}
              onChange={(e) => setAddUnit(e.target.value)}
              placeholder="Unit (cups, g…)"
              className="rounded-xl border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none"
            />
            <input
              type="text"
              value={addCategory}
              onChange={(e) => setAddCategory(e.target.value)}
              placeholder="Category"
              className="rounded-xl border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none"
            />
            <input
              type="date"
              value={addExpiry}
              onChange={(e) => setAddExpiry(e.target.value)}
              className="rounded-xl border border-border bg-muted px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
            />
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => setShowAdd(false)}
              className="flex-1 rounded-xl border border-border py-2 text-sm font-medium text-muted-foreground"
            >
              Cancel
            </button>
            <button
              onClick={addItem}
              disabled={!addName.trim() || adding}
              className="flex-1 rounded-xl bg-primary py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {adding ? "Adding…" : "Add"}
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </p>
      )}

      {/* Empty state */}
      {totalItems === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <BeakerIcon className="mb-3 h-16 w-16 text-muted-foreground/30" aria-hidden="true" />
          <p className="text-lg font-semibold text-foreground">Your pantry is empty</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add ingredients you have on hand to see matching recipes
          </p>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => setShowAdd(true)}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              Add Item
            </button>
            <button
              onClick={importFromShopping}
              className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-muted-foreground"
            >
              <ShoppingCartIcon className="h-4 w-4" aria-hidden="true" />
              Import from Shopping List
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-6">
            {Object.entries(grouped)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([category, items], gi) => (
                <section
                  key={category}
                  className="animate-fade-up"
                  style={{ animationDelay: `${gi * 60}ms` }}
                >
                  <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <span>{CATEGORY_ICONS[category] ?? "📦"}</span>
                    <span>{category}</span>
                    <span className="text-muted-foreground/50">({items.length})</span>
                  </h2>
                  <div className="space-y-2">
                    {sortByExpiry(items).map((item) => (
                      <PantryItemRow
                        key={item.id}
                        item={item}
                        onDelete={() => deleteItem(item)}
                        onUpdate={(updated) => {
                          setGrouped((prev) => {
                            const cat = item.category || "other";
                            return {
                              ...prev,
                              [cat]: (prev[cat] || []).map((i) =>
                                i.id === updated.id ? updated : i
                              ),
                            };
                          });
                        }}
                      />
                    ))}
                  </div>
                </section>
              ))}
          </div>

          <div className="mt-8 pb-8 text-center">
            <button
              onClick={clearPantry}
              className="text-xs text-muted-foreground hover:text-red-400 transition-colors"
            >
              Clear all pantry items
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Pantry Item Row ──────────────────────────────────────────────────────────

function PantryItemRow({
  item,
  onDelete,
  onUpdate,
}: {
  item: PantryItem;
  onDelete: () => void;
  onUpdate: (updated: PantryItem) => void;
}) {
  const { getToken } = useAuth();
  const [editing, setEditing] = useState(false);
  const [qty, setQty] = useState(item.quantity != null ? String(item.quantity) : "");
  const [unit, setUnit] = useState(item.unit ?? "");
  const [saving, setSaving] = useState(false);

  const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
  const isExpiringSoon =
    item.expires_on &&
    new Date(item.expires_on).getTime() <= Date.now() + threeDaysMs;
  const isExpiringToday =
    item.expires_on &&
    new Date(item.expires_on).toDateString() === new Date().toDateString();

  async function save() {
    setSaving(true);
    try {
      const token = await getToken();
      const { pantryApi } = await import("@/lib/api");
      const updated = await pantryApi.update(
        item.id,
        {
          quantity: qty ? parseFloat(qty) : null,
          unit: unit.trim() || null,
        },
        token
      );
      onUpdate(updated);
      setEditing(false);
    } catch {
      // silently ignore
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3",
        isExpiringToday && "bg-warning/10 border-warning/30"
      )}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground capitalize">
          {item.normalized_name}
        </p>
        {editing ? (
          <div className="mt-2 flex items-center gap-2">
            <input
              type="number"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="Qty"
              className="w-20 rounded-lg border border-border bg-muted px-2 py-1 text-xs text-foreground focus:border-primary focus:outline-none"
              min="0"
              step="any"
              autoFocus
            />
            <input
              type="text"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="unit"
              className="w-20 rounded-lg border border-border bg-muted px-2 py-1 text-xs text-foreground focus:border-primary focus:outline-none"
            />
            <button
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-60"
            >
              {saving ? "…" : "✓"}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground"
            >
              ✕
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 mt-0.5">
            {(item.quantity != null || item.unit) && (
              <button
                onClick={() => setEditing(true)}
                className="text-xs text-muted-foreground hover:text-primary transition-colors"
                title="Edit quantity"
              >
                {item.quantity != null ? item.quantity : ""}{item.unit ? ` ${item.unit}` : ""}
              </button>
            )}
            {!item.quantity && !item.unit && (
              <button
                onClick={() => setEditing(true)}
                className="text-xs text-muted-foreground/50 hover:text-primary transition-colors"
              >
                + add qty
              </button>
            )}
            {item.expires_on && (
              <span
                className={cn(
                  "text-xs",
                  isExpiringSoon ? "text-warning font-medium" : "text-muted-foreground"
                )}
              >
                {isExpiringSoon ? "⚠️ " : ""}Expires {item.expires_on}
              </span>
            )}
          </div>
        )}
      </div>
      <button
        onClick={onDelete}
        className="ml-2 flex-shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-400"
        aria-label={`Remove ${item.normalized_name} from pantry`}
      >
        <TrashIcon className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
