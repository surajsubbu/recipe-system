"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useAuth, useUser } from "@clerk/nextjs";
import { recipesApi, shoppingApi, mealPlanApi, collectionsApi } from "@/lib/api";
import type { Recipe, MealType, Collection } from "@/lib/types";
import { ServingsScaler } from "@/components/ServingsScaler";
import { IngredientChecklist } from "@/components/IngredientChecklist";
import { StepTimer } from "@/components/StepTimer";
import { PageSpinner } from "@/components/LoadingSpinner";
import { cn, formatCookTime, formatDate, totalTime, convertUnit, isYouTubeUrl, getYouTubeVideoId, type UnitSystem } from "@/lib/utils";
import {
  ArrowLeftIcon,
  ClockIcon,
  FireIcon,
  ShoppingCartIcon,
  CalendarIcon,
  PlayIcon,
  TrashIcon,
  GlobeAltIcon,
  PencilSquareIcon,
  BookmarkIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

export default function RecipeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { getToken } = useAuth();
  const { user } = useUser();

  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [multiplier, setMultiplier] = useState(1);
  const [unitSystem, setUnitSystem] = useState<UnitSystem>("original");
  const [toast, setToast] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [mealModalOpen, setMealModalOpen] = useState(false);
  const [saveSheetOpen, setSaveSheetOpen] = useState(false);
  const [inShoppingList, setInShoppingList] = useState(false);
  const [inMealPlan, setInMealPlan] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        setRecipe(await recipesApi.get(Number(id), token));
      } catch {
        setError("Recipe not found.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  async function addToShopping() {
    try {
      const token = await getToken();
      await shoppingApi.generateFromRecipe(Number(id), token);
      setInShoppingList(true);
      showToast("Added to shopping list!");
    } catch {
      showToast("Failed to add to shopping list.");
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this recipe? This cannot be undone.")) return;
    setDeleting(true);
    try {
      const token = await getToken();
      await recipesApi.delete(Number(id), token);
      router.push("/recipes");
    } catch {
      showToast("Failed to delete recipe.");
      setDeleting(false);
    }
  }

  const isAdmin =
    (user?.publicMetadata as { role?: string })?.role === "admin";

  if (loading) return <PageSpinner />;
  if (error || !recipe) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-lg font-semibold text-foreground">{error ?? "Not found"}</p>
        <Link href="/recipes" className="mt-4 text-sm text-primary hover:underline">
          ← Back to recipes
        </Link>
      </div>
    );
  }

  const time = totalTime(recipe.prep_time_minutes, recipe.cook_time_minutes);

  return (
    <div className="mx-auto max-w-2xl">
      {/* Back button */}
      <div className="px-safe sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-background/80 px-4 py-3 backdrop-blur-sm">
        <button
          onClick={() => router.push("/recipes")}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          aria-label="Go back to recipes"
        >
          <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
          Back
        </button>
        <div className="flex-1" />
        {/* Edit */}
        <Link
          href={`/recipe/${id}/edit`}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
          aria-label="Edit recipe"
        >
          <PencilSquareIcon className="h-5 w-5" aria-hidden="true" />
        </Link>
        {/* Delete */}
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-400"
          aria-label="Delete recipe"
        >
          <TrashIcon className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {/* Hero: YouTube embed or image */}
      {recipe.source_url && isYouTubeUrl(recipe.source_url) ? (
        <div className="relative aspect-video w-full overflow-hidden bg-black">
          <iframe
            src={`https://www.youtube.com/embed/${getYouTubeVideoId(recipe.source_url)}`}
            title={recipe.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 h-full w-full"
          />
        </div>
      ) : recipe.image_url ? (
        <div className="relative aspect-video w-full overflow-hidden bg-muted">
          <Image
            src={recipe.image_url}
            alt={recipe.title}
            fill
            priority
            className="object-cover"
            sizes="(max-width: 672px) 100vw, 672px"
          />
        </div>
      ) : null}

      <div className="px-safe px-4 py-5">
        {/* Title & meta */}
        <h1 className="mb-2 text-2xl font-bold leading-tight text-foreground">
          {recipe.title}
        </h1>
        {recipe.description && (
          <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
            {recipe.description}
          </p>
        )}

        {/* Stats row */}
        <div className="mb-4 flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
          {time && (
            <span className="flex items-center gap-1">
              <ClockIcon className="h-4 w-4" aria-hidden="true" /> {time}
            </span>
          )}
          {recipe.prep_time_minutes && (
            <span>Prep: {formatCookTime(recipe.prep_time_minutes)}</span>
          )}
          {recipe.cook_time_minutes && (
            <span>Cook: {formatCookTime(recipe.cook_time_minutes)}</span>
          )}
          {recipe.calories_per_serving && (
            <span className="flex items-center gap-1">
              <FireIcon className="h-4 w-4" aria-hidden="true" />
              {recipe.calories_per_serving} kcal
            </span>
          )}
          {recipe.cuisine && (
            <span className="capitalize">{recipe.cuisine}</span>
          )}
          {recipe.difficulty && (
            <span
              className={cn(
                "capitalize",
                recipe.difficulty === "easy" && "text-green-400",
                recipe.difficulty === "medium" && "text-yellow-400",
                recipe.difficulty === "hard" && "text-red-400"
              )}
            >
              {recipe.difficulty}
            </span>
          )}
        </div>

        {/* Tags */}
        {recipe.tags.length > 0 && (
          <div className="mb-5 flex flex-wrap gap-1.5">
            {recipe.tags.map((tag) => (
              <span
                key={tag.id}
                className="rounded-full bg-primary/10 px-3 py-0.5 text-xs text-primary"
              >
                {tag.name}
              </span>
            ))}
          </div>
        )}

        {/* Action buttons */}
        <div className="mb-6 grid grid-cols-2 gap-2">
          <button
            onClick={addToShopping}
            className={cn(
              "flex min-h-touch flex-col items-center justify-center gap-1 rounded-xl border p-3 text-xs font-medium transition-colors",
              inShoppingList
                ? "border-orange-500/40 bg-orange-500/10 text-orange-400"
                : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-primary"
            )}
          >
            <ShoppingCartIcon className="h-5 w-5" aria-hidden="true" />
            {inShoppingList ? "In List ✓" : "Add to List"}
          </button>
          <button
            onClick={() => setMealModalOpen(true)}
            className={cn(
              "flex min-h-touch flex-col items-center justify-center gap-1 rounded-xl border p-3 text-xs font-medium transition-colors",
              inMealPlan
                ? "border-orange-500/40 bg-orange-500/10 text-orange-400"
                : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-primary"
            )}
          >
            <CalendarIcon className="h-5 w-5" aria-hidden="true" />
            {inMealPlan ? "Planned ✓" : "Meal Plan"}
          </button>
          <button
            onClick={() => setSaveSheetOpen(true)}
            className="flex min-h-touch flex-col items-center justify-center gap-1 rounded-xl border border-border bg-card p-3 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
          >
            <BookmarkIcon className="h-5 w-5" aria-hidden="true" />
            Save
          </button>
          <Link
            href={`/cook/${id}`}
            className="flex min-h-touch flex-col items-center justify-center gap-1 rounded-xl bg-primary p-3 text-xs font-medium text-primary-foreground"
          >
            <PlayIcon className="h-5 w-5" aria-hidden="true" />
            Cook Mode
          </Link>
        </div>

        {/* Servings scaler & unit system */}
        <div className="mb-6 space-y-4">
          {recipe.servings && (
            <ServingsScaler
              original={recipe.servings}
              onChange={setMultiplier}
            />
          )}
          {recipe.ingredients.length > 0 && (
            <div>
              <label className="mb-2 block text-xs font-medium text-muted-foreground">
                Units
              </label>
              <div className="flex gap-2">
                {(["original", "metric", "imperial"] as const).map((sys) => (
                  <button
                    key={sys}
                    onClick={() => setUnitSystem(sys)}
                    className={cn(
                      "rounded-lg px-3 py-2 text-xs font-medium transition-colors",
                      unitSystem === sys
                        ? "bg-primary text-primary-foreground"
                        : "border border-border bg-card text-muted-foreground hover:border-primary/50"
                    )}
                  >
                    {sys === "original" ? "Original" : sys === "metric" ? "Metric" : "Imperial"}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Source links */}
        {(recipe.source_url || recipe.secondary_source_url) && (
          <div className="mb-6 flex flex-wrap gap-x-4 gap-y-1">
            {recipe.source_url && (
              <a
                href={recipe.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"
              >
                <GlobeAltIcon className="h-3.5 w-3.5" aria-hidden="true" />
                {recipe.source_url && isYouTubeUrl(recipe.source_url) ? "Watch on YouTube" : "View original source"}
              </a>
            )}
            {recipe.secondary_source_url && (
              <a
                href={recipe.secondary_source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"
              >
                <GlobeAltIcon className="h-3.5 w-3.5" aria-hidden="true" />
                Original Recipe
              </a>
            )}
          </div>
        )}

        {/* Ingredients */}
        {recipe.ingredients.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 text-lg font-semibold text-foreground">
              Ingredients
            </h2>
            <IngredientChecklist
              ingredients={recipe.ingredients}
              multiplier={multiplier}
              unitSystem={unitSystem}
            />
          </section>
        )}

        {/* Steps */}
        {recipe.steps.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 text-lg font-semibold text-foreground">
              Instructions
            </h2>
            <ol className="space-y-5">
              {recipe.steps.map((step, i) => {
                const prevSection = i > 0 ? recipe.steps[i - 1].section : null;
                const showSectionHeader = step.section && step.section !== prevSection;
                return (
                  <li key={step.id}>
                    {showSectionHeader && (
                      <p className="mb-3 mt-2 text-sm font-bold text-foreground">
                        {step.section}
                      </p>
                    )}
                    <div className="flex gap-4">
                      <span
                        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground"
                        aria-hidden="true"
                      >
                        {i + 1}
                      </span>
                      <div className="flex-1 space-y-2 pt-0.5">
                        <p className="text-sm leading-relaxed text-foreground">
                          {step.instruction}
                        </p>
                        {step.timer_seconds && (
                          <StepTimer seconds={step.timer_seconds} />
                        )}
                        {step.video_timestamp_seconds != null &&
                          recipe.source_url &&
                          isYouTubeUrl(recipe.source_url) && (
                            <a
                              href={`https://www.youtube.com/watch?v=${getYouTubeVideoId(recipe.source_url)}&t=${step.video_timestamp_seconds}s`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            >
                              ▶ Watch at {Math.floor(step.video_timestamp_seconds / 60)}:{String(step.video_timestamp_seconds % 60).padStart(2, "0")}
                            </a>
                          )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        {/* Video transcript */}
        {recipe.transcript && (
          <section className="mb-8">
            <h2 className="mb-3 text-lg font-semibold text-foreground">
              Video Transcript
            </h2>
            <div className="rounded-xl bg-muted p-4">
              <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
                {recipe.transcript}
              </p>
            </div>
          </section>
        )}

        <p className="text-xs text-muted-foreground">
          Added {formatDate(recipe.created_at)}
        </p>
      </div>

      {/* Save to Collection sheet */}
      {saveSheetOpen && (
        <SaveToCollectionSheet
          recipeId={recipe.id}
          onClose={() => setSaveSheetOpen(false)}
          onSaved={(msg) => {
            setSaveSheetOpen(false);
            showToast(msg);
          }}
        />
      )}

      {/* Meal plan modal */}
      {mealModalOpen && (
        <MealPlanModal
          recipeId={recipe.id}
          onClose={() => setMealModalOpen(false)}
          onAdded={() => {
            setMealModalOpen(false);
            setInMealPlan(true);
            showToast("Added to meal plan!");
          }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-card px-4 py-2.5 text-sm font-medium text-foreground shadow-lg"
          role="alert"
          aria-live="assertive"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

// ─── Save to Collection Sheet ─────────────────────────────────────────────────

function SaveToCollectionSheet({
  recipeId,
  onClose,
  onSaved,
}: {
  recipeId: number;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const { getToken } = useAuth();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [addedIds, setAddedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        const result = await collectionsApi.list(token);
        setCollections(result.items);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function addToCollection(collectionId: number, collectionName: string) {
    try {
      const token = await getToken();
      await collectionsApi.addRecipe(collectionId, recipeId, token);
      setAddedIds((prev) => new Set([...prev, collectionId]));
      onSaved(`Added to "${collectionName}"!`);
    } catch {
      onSaved("Failed to save to collection.");
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Save to Collection"
        className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up rounded-t-2xl border-t border-border bg-card px-4 pb-safe pt-4"
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-muted" />
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">Save to Collection</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Close"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : collections.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-sm text-muted-foreground mb-3">No collections yet</p>
            <Link
              href="/collections"
              onClick={onClose}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              Create Collection
            </Link>
          </div>
        ) : (
          <div className="mb-4 max-h-64 overflow-y-auto space-y-1">
            {collections.map((col) => (
              <div
                key={col.id}
                className="flex items-center justify-between rounded-xl px-3 py-2.5 hover:bg-accent"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{col.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {col.recipe_count} recipe{col.recipe_count !== 1 ? "s" : ""}
                  </p>
                </div>
                <button
                  onClick={() => addToCollection(col.id, col.name)}
                  disabled={addedIds.has(col.id)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                    addedIds.has(col.id)
                      ? "bg-success/20 text-success"
                      : "bg-primary/10 text-primary hover:bg-primary/20"
                  )}
                >
                  {addedIds.has(col.id) ? "✓ Added" : "+ Add"}
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mb-8">
          <Link
            href="/collections"
            onClick={onClose}
            className="block text-center text-sm text-primary hover:underline"
          >
            Manage Collections →
          </Link>
        </div>
      </div>
    </>
  );
}

// ─── Meal Plan Modal ──────────────────────────────────────────────────────────

const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

function MealPlanModal({
  recipeId,
  onClose,
  onAdded,
}: {
  recipeId: number;
  onClose: () => void;
  onAdded: () => void;
}) {
  const { getToken } = useAuth();
  const [date, setDate] = useState(
    () => new Date().toISOString().slice(0, 10)
  );
  const [mealType, setMealType] = useState<MealType>("dinner");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const token = await getToken();
      await mealPlanApi.add(
        { planned_date: date, meal_type: mealType, recipe_id: recipeId },
        token
      );
      onAdded();
    } catch {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Add to meal plan"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-sm rounded-t-2xl bg-card p-6 sm:rounded-2xl">
        <h3 className="mb-4 text-base font-semibold text-foreground">
          Add to Meal Plan
        </h3>

        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          Date
        </label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="mb-4 w-full rounded-xl border border-border bg-muted px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
        />

        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          Meal
        </label>
        <div className="mb-6 grid grid-cols-2 gap-2">
          {MEAL_TYPES.map((mt) => (
            <button
              key={mt}
              onClick={() => setMealType(mt)}
              className={cn(
                "min-h-touch rounded-xl border py-2 text-sm font-medium capitalize transition-colors",
                mealType === mt
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/50"
              )}
            >
              {mt}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium text-muted-foreground"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {saving ? "Saving…" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}
