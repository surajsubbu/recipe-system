"use client";

import { useState } from "react";
import { cn, displayAmount, scaleAmount } from "@/lib/utils";
import type { Ingredient } from "@/lib/types";
import { CheckIcon } from "@heroicons/react/24/outline";

interface IngredientChecklistProps {
  ingredients: Ingredient[];
  multiplier?: number; // servings scale factor (1 = original)
  className?: string;
}

export function IngredientChecklist({
  ingredients,
  multiplier = 1,
  className,
}: IngredientChecklistProps) {
  const [checked, setChecked] = useState<Set<number>>(new Set());

  function toggle(id: number) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <ul className={cn("space-y-1", className)}>
      {ingredients.map((ing) => {
        const isChecked = checked.has(ing.id);
        const scaledAmount = scaleAmount(ing.amount, multiplier);
        const amountStr = displayAmount(scaledAmount);

        return (
          <li key={ing.id}>
            <button
              onClick={() => toggle(ing.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl p-3 text-left transition-colors",
                isChecked
                  ? "bg-muted/50 text-muted-foreground"
                  : "hover:bg-muted"
              )}
              role="checkbox"
              aria-checked={isChecked}
            >
              {/* Checkbox */}
              <span
                className={cn(
                  "flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 transition-colors",
                  isChecked
                    ? "border-primary bg-primary"
                    : "border-border bg-transparent"
                )}
                aria-hidden="true"
              >
                {isChecked && (
                  <CheckIcon className="h-3.5 w-3.5 text-primary-foreground" />
                )}
              </span>

              {/* Text */}
              <span className={cn("flex-1 text-sm", isChecked && "line-through")}>
                {amountStr && (
                  <span className="font-semibold text-foreground">
                    {amountStr}{" "}
                  </span>
                )}
                {ing.unit && (
                  <span className="text-muted-foreground">{ing.unit} </span>
                )}
                <span>{ing.name}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
