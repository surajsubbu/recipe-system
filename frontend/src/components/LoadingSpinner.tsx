"use client";

import { cn } from "@/lib/utils";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  label?: string;
}

const sizeMap = {
  sm: "h-4 w-4 border-2",
  md: "h-8 w-8 border-2",
  lg: "h-12 w-12 border-[3px]",
};

export function LoadingSpinner({
  size = "md",
  className,
  label = "Loading…",
}: LoadingSpinnerProps) {
  return (
    <div
      role="status"
      className={cn("flex flex-col items-center justify-center gap-3", className)}
    >
      <div
        className={cn(
          "animate-spin rounded-full border-primary/30 border-t-primary",
          sizeMap[size]
        )}
        aria-hidden="true"
      />
      {label && <span className="sr-only">{label}</span>}
    </div>
  );
}

export function PageSpinner() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <LoadingSpinner size="lg" />
    </div>
  );
}
