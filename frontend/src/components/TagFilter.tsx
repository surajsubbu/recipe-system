"use client";

import { cn } from "@/lib/utils";
import type { Tag } from "@/lib/types";

interface TagFilterProps {
  tags: Tag[];
  selected: string | null;
  onChange: (tag: string | null) => void;
  className?: string;
}

export function TagFilter({
  tags,
  selected,
  onChange,
  className,
}: TagFilterProps) {
  return (
    <div
      className={cn(
        "flex gap-2 overflow-x-auto pb-1 scrollbar-none",
        className
      )}
      role="group"
      aria-label="Filter by tag"
    >
      <button
        onClick={() => onChange(null)}
        className={cn(
          "min-h-touch flex-shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
          selected === null
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground hover:bg-muted/80"
        )}
        aria-pressed={selected === null}
      >
        All
      </button>
      {tags.map((tag) => (
        <button
          key={tag.id}
          onClick={() => onChange(selected === tag.name ? null : tag.name)}
          className={cn(
            "min-h-touch flex-shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
            selected === tag.name
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          )}
          aria-pressed={selected === tag.name}
        >
          {tag.name}
        </button>
      ))}
    </div>
  );
}
