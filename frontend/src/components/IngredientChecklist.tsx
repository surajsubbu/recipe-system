"use client";

import { useState } from "react";
import { cn, displayAmount, scaleAmount, convertUnit, getIngredientEmoji, getIngredientImageUrl, type UnitSystem } from "@/lib/utils";
import type { Ingredient } from "@/lib/types";
import { CheckIcon } from "@heroicons/react/24/outline";

interface IngredientChecklistProps {
  ingredients: Ingredient[];
  multiplier?: number; // servings scale factor (1 = original)
  unitSystem?: UnitSystem; // unit system (original/metric/imperial)
  className?: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  produce:    "Vegetables & Produce",
  meat:       "Meat & Poultry",
  seafood:    "Seafood",
  dairy:      "Dairy & Eggs",
  spices:     "Herbs & Spices",
  pantry:     "Pantry & Dry Goods",
  bakery:     "Baking",
  beverages:  "Liquids & Beverages",
  condiments: "Condiments & Sauces",
  frozen:     "Frozen",
  other:      "Other",
};

const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS);

export function IngredientChecklist({
  ingredients,
  multiplier = 1,
  unitSystem = "original",
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

  // Check if recipe has sections
  const hasSections = ingredients.some((ing) => ing.section);

  // Group ingredients by section first (if any), then by category within each section
  type SectionGroup = { section: string | null; catGroups: { cat: string; label: string; items: Ingredient[] }[] };
  const sectionGroups: SectionGroup[] = [];

  if (hasSections) {
    // Gather unique sections in order of appearance
    const sectionOrder: string[] = [];
    const sectionMap = new Map<string, Ingredient[]>();
    for (const ing of ingredients) {
      const sec = ing.section || "Other";
      if (!sectionMap.has(sec)) {
        sectionOrder.push(sec);
        sectionMap.set(sec, []);
      }
      sectionMap.get(sec)!.push(ing);
    }
    for (const sec of sectionOrder) {
      const sectionIngs = sectionMap.get(sec)!;
      const catMap = new Map<string, Ingredient[]>();
      for (const ing of sectionIngs) {
        const cat = ing.category && CATEGORY_LABELS[ing.category] ? ing.category : "other";
        if (!catMap.has(cat)) catMap.set(cat, []);
        catMap.get(cat)!.push(ing);
      }
      const catGroups = CATEGORY_ORDER
        .filter((c) => catMap.has(c))
        .map((c) => ({ cat: c, label: CATEGORY_LABELS[c], items: catMap.get(c)! }));
      sectionGroups.push({ section: sec, catGroups });
    }
  } else {
    // No sections — group only by category
    const catMap = new Map<string, Ingredient[]>();
    for (const ing of ingredients) {
      const cat = ing.category && CATEGORY_LABELS[ing.category] ? ing.category : "other";
      if (!catMap.has(cat)) catMap.set(cat, []);
      catMap.get(cat)!.push(ing);
    }
    const catGroups = CATEGORY_ORDER
      .filter((c) => catMap.has(c))
      .map((c) => ({ cat: c, label: CATEGORY_LABELS[c], items: catMap.get(c)! }));
    sectionGroups.push({ section: null, catGroups });
  }

  return (
    <div className={cn("space-y-4", className)}>
      {sectionGroups.map(({ section, catGroups }) => (
        <div key={section ?? "_none"}>
          {section && (
            <h3 className="mb-2 px-1 text-sm font-bold text-foreground">
              {section}
            </h3>
          )}
          {catGroups.map(({ cat, label, items }) => (
            <div key={`${section ?? ""}-${cat}`}>
              <h3 className="mb-1 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {label}
              </h3>
              <ul className="space-y-1">
                {items.map((ing) => {
                  const isChecked = checked.has(ing.id);
                  const scaledAmount = scaleAmount(ing.amount, multiplier);
                  const converted = convertUnit(scaledAmount, ing.unit, unitSystem);
                  const amountStr = displayAmount(converted.amount);
                  const imgUrl = getIngredientImageUrl(ing.normalized_name);

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

                        {/* Ingredient photo with emoji fallback */}
                        {imgUrl ? (
                          <img
                            src={imgUrl}
                            alt=""
                            aria-hidden="true"
                            width={28}
                            height={28}
                            className="rounded-full object-cover flex-shrink-0"
                            onError={(e) => {
                              const target = e.currentTarget;
                              target.style.display = "none";
                              const sibling = target.nextElementSibling as HTMLElement | null;
                              if (sibling) sibling.removeAttribute("hidden");
                            }}
                          />
                        ) : null}
                        <span aria-hidden="true" className="text-base flex-shrink-0" hidden={!!imgUrl}>
                          {getIngredientEmoji(ing.name, ing.category)}
                        </span>

                        {/* Text */}
                        <span className={cn("flex-1 text-sm", isChecked && "line-through")}>
                          {amountStr && (
                            <span className="font-semibold text-foreground">
                              {amountStr}{" "}
                            </span>
                          )}
                          {converted.unit && (
                            <span className="text-muted-foreground">{converted.unit} </span>
                          )}
                          <span>{ing.name}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
