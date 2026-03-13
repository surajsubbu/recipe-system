"use client";

import { useState, useRef } from "react";
import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/utils";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function SearchBar({
  value,
  onChange,
  placeholder = "Search recipes…",
  className,
}: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      className={cn(
        "flex min-h-touch items-center gap-2 rounded-xl border border-border bg-muted px-3 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary",
        className
      )}
    >
      <MagnifyingGlassIcon
        className="h-5 w-5 flex-shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 bg-transparent py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        aria-label={placeholder}
      />
      {value && (
        <button
          onClick={() => {
            onChange("");
            inputRef.current?.focus();
          }}
          className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
          aria-label="Clear search"
        >
          <XMarkIcon className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
