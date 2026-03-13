"use client";

import { useState } from "react";
import { MinusIcon, PlusIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/utils";

interface ServingsScalerProps {
  original: number;
  onChange: (multiplier: number) => void;
  className?: string;
}

export function ServingsScaler({
  original,
  onChange,
  className,
}: ServingsScalerProps) {
  const [current, setCurrent] = useState(original);

  function update(next: number) {
    const clamped = Math.max(1, Math.min(99, next));
    setCurrent(clamped);
    onChange(clamped / original);
  }

  return (
    <div
      className={cn("flex items-center gap-3", className)}
      aria-label="Servings"
    >
      <span className="text-sm font-medium text-muted-foreground">
        Servings
      </span>
      <div className="flex items-center rounded-xl border border-border bg-muted">
        <button
          onClick={() => update(current - 1)}
          disabled={current <= 1}
          className="flex h-10 w-10 items-center justify-center rounded-l-xl text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Decrease servings"
        >
          <MinusIcon className="h-4 w-4" aria-hidden="true" />
        </button>

        <input
          type="number"
          min={1}
          max={99}
          value={current}
          onChange={(e) => update(parseInt(e.target.value, 10) || 1)}
          className="w-12 bg-transparent py-2 text-center text-sm font-semibold text-foreground focus:outline-none"
          aria-label={`${current} servings`}
        />

        <button
          onClick={() => update(current + 1)}
          disabled={current >= 99}
          className="flex h-10 w-10 items-center justify-center rounded-r-xl text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Increase servings"
        >
          <PlusIcon className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {current !== original && (
        <button
          onClick={() => update(original)}
          className="text-xs text-primary underline-offset-2 hover:underline"
        >
          Reset
        </button>
      )}
    </div>
  );
}
