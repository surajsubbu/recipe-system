"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import Image from "next/image";
import { mealPlanApi, shoppingApi } from "@/lib/api";
import type { WeekMealPlan, MealPlan, MealType } from "@/lib/types";
import { PageSpinner } from "@/components/LoadingSpinner";
import { cn, weekMonday, addDays, shortWeekday, formatDate } from "@/lib/utils";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  TrashIcon,
  ShoppingCartIcon,
} from "@heroicons/react/24/outline";

const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

const MEAL_COLORS: Record<MealType, string> = {
  breakfast: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  lunch: "bg-green-500/15 text-green-400 border-green-500/30",
  dinner: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  snack: "bg-purple-500/15 text-purple-400 border-purple-500/30",
};

export default function MealPlanPage() {
  const { getToken } = useAuth();
  const [weekOf, setWeekOf] = useState(() => weekMonday());
  const [plan, setPlan] = useState<WeekMealPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      setPlan(await mealPlanApi.getWeek(weekOf, token));
    } catch {
      // empty plan
    } finally {
      setLoading(false);
    }
  }, [weekOf]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load();
  }, [load]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  function prevWeek() {
    setWeekOf((w) => addDays(w, -7));
  }

  function nextWeek() {
    setWeekOf((w) => addDays(w, 7));
  }

  function goToday() {
    setWeekOf(weekMonday());
  }

  async function removeEntry(entryId: number) {
    setPlan((prev) =>
      prev
        ? { ...prev, entries: prev.entries.filter((e) => e.id !== entryId) }
        : prev
    );
    try {
      const token = await getToken();
      await mealPlanApi.remove(entryId, token);
    } catch {
      load();
    }
  }

  async function generateShoppingList() {
    try {
      const token = await getToken();
      const endDate = addDays(weekOf, 6);
      await mealPlanApi.generateShoppingList(weekOf, endDate, token);
      showToast("Week added to shopping list!");
    } catch {
      showToast("Failed to generate shopping list.");
    }
  }

  // Build days array Mon–Sun
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekOf, i));

  // Build a lookup: date → meal_type → entry
  const entryMap = new Map<string, Map<MealType, MealPlan>>();
  for (const entry of plan?.entries ?? []) {
    if (!entryMap.has(entry.planned_date)) {
      entryMap.set(entry.planned_date, new Map());
    }
    entryMap.get(entry.planned_date)!.set(entry.meal_type, entry);
  }

  const today = new Date().toISOString().slice(0, 10);
  const isCurrentWeek = weekOf === weekMonday();

  return (
    <div className="px-safe mx-auto max-w-3xl px-2 pt-6">
      {/* Header */}
      <div className="mb-4 flex items-center gap-2 px-2">
        <h1 className="text-2xl font-bold text-foreground">Meal Plan</h1>
        <div className="flex-1" />
        {/* Shopping list button */}
        {(plan?.entries.length ?? 0) > 0 && (
          <button
            onClick={generateShoppingList}
            className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground hover:text-primary"
          >
            <ShoppingCartIcon className="h-4 w-4" aria-hidden="true" />
            Add week to list
          </button>
        )}
      </div>

      {/* Week navigation */}
      <div className="mb-4 flex items-center gap-2 px-2">
        <button
          onClick={prevWeek}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground"
          aria-label="Previous week"
        >
          <ChevronLeftIcon className="h-4 w-4" aria-hidden="true" />
        </button>

        <button
          onClick={goToday}
          className={cn(
            "flex-1 rounded-xl border py-2 text-sm font-medium transition-colors",
            isCurrentWeek
              ? "border-primary/50 bg-primary/10 text-primary"
              : "border-border bg-card text-muted-foreground hover:text-foreground"
          )}
        >
          {formatDate(weekOf, { month: "short", day: "numeric" })} –{" "}
          {formatDate(addDays(weekOf, 6), { month: "short", day: "numeric" })}
          {isCurrentWeek && " (this week)"}
        </button>

        <button
          onClick={nextWeek}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground"
          aria-label="Next week"
        >
          <ChevronRightIcon className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {loading ? (
        <PageSpinner />
      ) : (
        <div className="space-y-2 pb-8">
          {days.map((date) => {
            const dayEntries = entryMap.get(date);
            const isToday = date === today;

            return (
              <div
                key={date}
                className={cn(
                  "overflow-hidden rounded-2xl border",
                  isToday ? "border-primary/50" : "border-border"
                )}
              >
                {/* Day header */}
                <div
                  className={cn(
                    "flex items-center gap-2 px-4 py-2",
                    isToday ? "bg-primary/10" : "bg-card"
                  )}
                >
                  <span
                    className={cn(
                      "text-sm font-semibold",
                      isToday ? "text-primary" : "text-foreground"
                    )}
                  >
                    {shortWeekday(date)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(date, { month: "short", day: "numeric" })}
                  </span>
                  {isToday && (
                    <span className="ml-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                      Today
                    </span>
                  )}
                </div>

                {/* Meal slots */}
                <div className="divide-y divide-border">
                  {MEAL_TYPES.map((meal) => {
                    const entry = dayEntries?.get(meal);
                    return (
                      <div
                        key={meal}
                        className="flex min-h-[3rem] items-center gap-3 bg-background px-4 py-2"
                      >
                        {/* Meal badge */}
                        <span
                          className={cn(
                            "w-20 flex-shrink-0 rounded-full border px-2 py-0.5 text-center text-[10px] font-semibold capitalize",
                            MEAL_COLORS[meal]
                          )}
                        >
                          {meal}
                        </span>

                        {entry ? (
                          <>
                            {/* Recipe thumbnail */}
                            {entry.recipe.image_url ? (
                              <div className="relative h-8 w-8 flex-shrink-0 overflow-hidden rounded-lg bg-muted">
                                <Image
                                  src={entry.recipe.image_url}
                                  alt={entry.recipe.title}
                                  fill
                                  className="object-cover"
                                  sizes="32px"
                                />
                              </div>
                            ) : (
                              <div className="h-8 w-8 flex-shrink-0 rounded-lg bg-muted" />
                            )}

                            {/* Recipe name */}
                            <Link
                              href={`/recipe/${entry.recipe_id}`}
                              className="flex-1 truncate text-sm text-foreground hover:text-primary"
                            >
                              {entry.recipe.title}
                            </Link>

                            {/* Remove */}
                            <button
                              onClick={() => removeEntry(entry.id)}
                              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-red-400"
                              aria-label={`Remove ${entry.recipe.title} from ${meal}`}
                            >
                              <TrashIcon className="h-4 w-4" aria-hidden="true" />
                            </button>
                          </>
                        ) : (
                          <>
                            <span className="flex-1 text-xs text-muted-foreground">
                              Empty
                            </span>
                            <Link
                              href={`/recipes?planDate=${date}&planMeal=${meal}`}
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground hover:border-primary/50 hover:text-primary"
                              aria-label={`Add ${meal} for ${date}`}
                            >
                              <PlusIcon className="h-4 w-4" aria-hidden="true" />
                            </Link>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
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
