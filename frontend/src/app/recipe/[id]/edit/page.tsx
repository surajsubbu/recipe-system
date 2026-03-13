"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { recipesApi } from "@/lib/api";
import type { Recipe, Ingredient, Step } from "@/lib/types";
import { PageSpinner } from "@/components/LoadingSpinner";
import {
  ArrowLeftIcon,
  PlusIcon,
  TrashIcon,
  ArrowUpIcon,
  ArrowDownIcon,
} from "@heroicons/react/24/outline";

// ─── Editable Ingredient ──────────────────────────────────────────────────────

interface EditableIngredient {
  key: number; // local key for React
  name: string;
  amount: string;
  unit: string;
}

// ─── Editable Step ────────────────────────────────────────────────────────────

interface EditableStep {
  key: number;
  instruction: string;
  timer_seconds: string;
}

let nextKey = 1;
function genKey() {
  return nextKey++;
}

export default function EditRecipePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { getToken } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form fields
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [prepTime, setPrepTime] = useState("");
  const [cookTime, setCookTime] = useState("");
  const [servings, setServings] = useState("");
  const [calories, setCalories] = useState("");
  const [cuisine, setCuisine] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [tags, setTags] = useState("");
  const [ingredients, setIngredients] = useState<EditableIngredient[]>([]);
  const [steps, setSteps] = useState<EditableStep[]>([]);

  // Load recipe data
  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        const r = await recipesApi.get(Number(id), token);
        setTitle(r.title);
        setDescription(r.description ?? "");
        setSourceUrl(r.source_url ?? "");
        setImageUrl(r.image_url ?? "");
        setPrepTime(r.prep_time_minutes?.toString() ?? "");
        setCookTime(r.cook_time_minutes?.toString() ?? "");
        setServings(r.servings?.toString() ?? "");
        setCalories(r.calories_per_serving?.toString() ?? "");
        setCuisine(r.cuisine ?? "");
        setDifficulty(r.difficulty ?? "");
        setTags(r.tags.map((t) => t.name).join(", "));
        setIngredients(
          r.ingredients.map((ing) => ({
            key: genKey(),
            name: ing.name,
            amount: ing.amount?.toString() ?? "",
            unit: ing.unit ?? "",
          }))
        );
        setSteps(
          r.steps.map((s) => ({
            key: genKey(),
            instruction: s.instruction,
            timer_seconds: s.timer_seconds?.toString() ?? "",
          }))
        );
      } catch {
        setError("Failed to load recipe");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Ingredient helpers ──────────────────────────────────────────────────────

  const updateIngredient = useCallback(
    (key: number, field: keyof EditableIngredient, value: string) => {
      setIngredients((prev) =>
        prev.map((ing) => (ing.key === key ? { ...ing, [field]: value } : ing))
      );
    },
    []
  );

  function addIngredient() {
    setIngredients((prev) => [
      ...prev,
      { key: genKey(), name: "", amount: "", unit: "" },
    ]);
  }

  function removeIngredient(key: number) {
    setIngredients((prev) => prev.filter((ing) => ing.key !== key));
  }

  // ── Step helpers ────────────────────────────────────────────────────────────

  const updateStep = useCallback(
    (key: number, field: keyof EditableStep, value: string) => {
      setSteps((prev) =>
        prev.map((s) => (s.key === key ? { ...s, [field]: value } : s))
      );
    },
    []
  );

  function addStep() {
    setSteps((prev) => [
      ...prev,
      { key: genKey(), instruction: "", timer_seconds: "" },
    ]);
  }

  function removeStep(key: number) {
    setSteps((prev) => prev.filter((s) => s.key !== key));
  }

  function moveStep(idx: number, dir: -1 | 1) {
    setSteps((prev) => {
      const arr = [...prev];
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= arr.length) return arr;
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      return arr;
    });
  }

  // ── Save ────────────────────────────────────────────────────────────────────

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const token = await getToken();
      await recipesApi.update(
        Number(id),
        {
          title: title.trim(),
          description: description.trim() || null,
          source_url: sourceUrl.trim() || null,
          image_url: imageUrl.trim() || null,
          prep_time_minutes: prepTime ? parseInt(prepTime) : null,
          cook_time_minutes: cookTime ? parseInt(cookTime) : null,
          servings: servings ? parseInt(servings) : null,
          calories_per_serving: calories ? parseInt(calories) : null,
          cuisine: cuisine.trim() || null,
          difficulty: difficulty || null,
          ingredients: ingredients
            .filter((ing) => ing.name.trim())
            .map((ing) => ({
              name: ing.name.trim(),
              amount: ing.amount ? parseFloat(ing.amount) : null,
              unit: ing.unit.trim() || null,
            })),
          steps: steps
            .filter((s) => s.instruction.trim())
            .map((s, i) => ({
              order: i + 1,
              instruction: s.instruction.trim(),
              timer_seconds: s.timer_seconds
                ? parseInt(s.timer_seconds)
                : null,
            })),
          tags: tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        },
        token
      );
      router.push(`/recipe/${id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
      setSaving(false);
    }
  }

  if (loading) return <PageSpinner />;
  if (error && !title) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-lg font-semibold text-foreground">{error}</p>
        <button
          onClick={() => router.back()}
          className="mt-4 text-sm text-primary hover:underline"
        >
          Go back
        </button>
      </div>
    );
  }

  const inputCls =
    "w-full rounded-xl border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";
  const labelCls = "mb-1 block text-xs font-medium text-muted-foreground";

  return (
    <div className="mx-auto max-w-2xl pb-24">
      {/* Header */}
      <div className="px-safe sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-background/80 px-4 py-3 backdrop-blur-sm">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="h-4 w-4" /> Cancel
        </button>
        <div className="flex-1" />
        <button
          onClick={handleSave}
          disabled={saving || !title.trim()}
          className="rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      <div className="px-safe space-y-6 px-4 pt-6">
        {error && (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
            {error}
          </p>
        )}

        {/* ── Basic Info ──────────────────────────────────────────────── */}
        <section>
          <h2 className="mb-3 text-base font-semibold text-foreground">
            Basic Info
          </h2>
          <div className="space-y-3">
            <div>
              <label className={labelCls}>Title *</label>
              <input
                className={inputCls}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Recipe title"
              />
            </div>
            <div>
              <label className={labelCls}>Description</label>
              <textarea
                className={inputCls + " min-h-[80px] resize-y"}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description"
              />
            </div>
            <div>
              <label className={labelCls}>Image URL</label>
              <input
                className={inputCls}
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>
            <div>
              <label className={labelCls}>Source URL</label>
              <input
                className={inputCls}
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>Prep (min)</label>
                <input
                  type="number"
                  className={inputCls}
                  value={prepTime}
                  onChange={(e) => setPrepTime(e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls}>Cook (min)</label>
                <input
                  type="number"
                  className={inputCls}
                  value={cookTime}
                  onChange={(e) => setCookTime(e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls}>Servings</label>
                <input
                  type="number"
                  className={inputCls}
                  value={servings}
                  onChange={(e) => setServings(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>Calories</label>
                <input
                  type="number"
                  className={inputCls}
                  value={calories}
                  onChange={(e) => setCalories(e.target.value)}
                  placeholder="per serving"
                />
              </div>
              <div>
                <label className={labelCls}>Cuisine</label>
                <input
                  className={inputCls}
                  value={cuisine}
                  onChange={(e) => setCuisine(e.target.value)}
                  placeholder="Italian"
                />
              </div>
              <div>
                <label className={labelCls}>Difficulty</label>
                <select
                  className={inputCls}
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value)}
                >
                  <option value="">—</option>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
            </div>
            <div>
              <label className={labelCls}>Tags (comma-separated)</label>
              <input
                className={inputCls}
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="italian, dessert, no-bake"
              />
            </div>
          </div>
        </section>

        {/* ── Ingredients ─────────────────────────────────────────────── */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">
              Ingredients
            </h2>
            <button
              onClick={addIngredient}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
            >
              <PlusIcon className="h-4 w-4" /> Add
            </button>
          </div>
          <div className="space-y-2">
            {ingredients.map((ing) => (
              <div key={ing.key} className="flex items-center gap-2">
                <input
                  className={inputCls + " flex-[3]"}
                  value={ing.name}
                  onChange={(e) =>
                    updateIngredient(ing.key, "name", e.target.value)
                  }
                  placeholder="Ingredient name"
                />
                <input
                  type="number"
                  className={inputCls + " flex-1"}
                  value={ing.amount}
                  onChange={(e) =>
                    updateIngredient(ing.key, "amount", e.target.value)
                  }
                  placeholder="Amt"
                  step="any"
                />
                <input
                  className={inputCls + " flex-1"}
                  value={ing.unit}
                  onChange={(e) =>
                    updateIngredient(ing.key, "unit", e.target.value)
                  }
                  placeholder="Unit"
                />
                <button
                  onClick={() => removeIngredient(ing.key)}
                  className="flex-shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-400"
                  aria-label="Remove ingredient"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* ── Steps ───────────────────────────────────────────────────── */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">Steps</h2>
            <button
              onClick={addStep}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
            >
              <PlusIcon className="h-4 w-4" /> Add
            </button>
          </div>
          <div className="space-y-3">
            {steps.map((step, idx) => (
              <div
                key={step.key}
                className="rounded-xl border border-border bg-card p-3"
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    {idx + 1}
                  </span>
                  <div className="flex-1" />
                  <button
                    onClick={() => moveStep(idx, -1)}
                    disabled={idx === 0}
                    className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                    aria-label="Move up"
                  >
                    <ArrowUpIcon className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => moveStep(idx, 1)}
                    disabled={idx === steps.length - 1}
                    className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                    aria-label="Move down"
                  >
                    <ArrowDownIcon className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => removeStep(step.key)}
                    className="rounded p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-400"
                    aria-label="Remove step"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
                <textarea
                  className={inputCls + " mb-2 min-h-[60px] resize-y"}
                  value={step.instruction}
                  onChange={(e) =>
                    updateStep(step.key, "instruction", e.target.value)
                  }
                  placeholder="Step instruction..."
                />
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground">
                    Timer (seconds):
                  </label>
                  <input
                    type="number"
                    className={inputCls + " w-24"}
                    value={step.timer_seconds}
                    onChange={(e) =>
                      updateStep(step.key, "timer_seconds", e.target.value)
                    }
                    placeholder="e.g. 300"
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
