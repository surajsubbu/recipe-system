"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { recipesApi } from "@/lib/api";
import type { Recipe, Step } from "@/lib/types";
import { StepTimer } from "@/components/StepTimer";
import { PageSpinner } from "@/components/LoadingSpinner";
import { useWakeLock } from "@/lib/hooks";
import { cn, isYouTubeUrl, getYouTubeVideoId } from "@/lib/utils";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  XMarkIcon,
  LightBulbIcon,
  VideoCameraIcon,
} from "@heroicons/react/24/outline";
import { LightBulbIcon as LightBulbSolid, VideoCameraIcon as VideoCameraSolid } from "@heroicons/react/24/solid";

export default function CookPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { getToken } = useAuth();

  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState(0);
  const [showVideo, setShowVideo] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const { supported: wakeLockSupported, active: wakeLockActive, request: requestWakeLock, release: releaseWakeLock } = useWakeLock();

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        const r = await recipesApi.get(Number(id), token);
        setRecipe(r);
        // Auto-show video for YouTube recipes
        if (r.source_url && isYouTubeUrl(r.source_url)) {
          setShowVideo(true);
        }
        // Request wake lock when entering cook mode
        requestWakeLock().then(() => {
          showToast("Screen will stay on while cooking");
        });
      } catch {
        router.push(`/recipe/${id}`);
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      releaseWakeLock();
    };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <PageSpinner />;
  if (!recipe || recipe.steps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-8 text-center">
        <p className="text-lg font-semibold text-foreground">No steps found</p>
        <button
          onClick={() => router.back()}
          className="mt-4 text-sm text-primary hover:underline"
        >
          Go back
        </button>
      </div>
    );
  }

  const steps = recipe.steps;
  const step = steps[currentStep];
  const isFirst = currentStep === 0;
  const isLast = currentStep === steps.length - 1;
  const videoId = recipe.source_url && isYouTubeUrl(recipe.source_url)
    ? getYouTubeVideoId(recipe.source_url)
    : null;

  function prev() {
    if (!isFirst) setCurrentStep((s) => s - 1);
  }

  function next() {
    if (!isLast) setCurrentStep((s) => s + 1);
  }

  // Swipe support
  function handleTouchStart(e: React.TouchEvent) {
    const startX = e.touches[0].clientX;
    function handleTouchEnd(ev: TouchEvent) {
      const dx = ev.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 60) {
        if (dx < 0) next();
        else prev();
      }
      window.removeEventListener("touchend", handleTouchEnd);
    }
    window.addEventListener("touchend", handleTouchEnd, { once: true });
  }

  return (
    <div
      className="flex min-h-screen flex-col bg-background select-none"
      onTouchStart={handleTouchStart}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 pt-safe py-3">
        <button
          onClick={() => {
            releaseWakeLock();
            router.push(`/recipe/${id}`);
          }}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-card text-muted-foreground"
          aria-label="Exit cook mode"
        >
          <XMarkIcon className="h-5 w-5" aria-hidden="true" />
        </button>

        {/* Progress dots */}
        <div className="flex gap-1.5" role="list" aria-label="Steps">
          {steps.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentStep(i)}
              role="listitem"
              className={cn(
                "h-2 rounded-full transition-all",
                i === currentStep
                  ? "w-6 bg-primary"
                  : i < currentStep
                  ? "w-2 bg-primary/50"
                  : "w-2 bg-muted"
              )}
              aria-label={`Step ${i + 1}`}
              aria-current={i === currentStep ? "step" : undefined}
            />
          ))}
        </div>

        <div className="flex items-center gap-2">
          {/* Video toggle (only for YouTube recipes) */}
          {videoId && (
            <button
              onClick={() => setShowVideo((v) => !v)}
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full",
                showVideo ? "bg-primary/20 text-primary" : "bg-card text-muted-foreground"
              )}
              aria-label={showVideo ? "Hide video" : "Show video"}
              title={showVideo ? "Hide video" : "Show video"}
            >
              {showVideo ? (
                <VideoCameraSolid className="h-5 w-5" aria-hidden="true" />
              ) : (
                <VideoCameraIcon className="h-5 w-5" aria-hidden="true" />
              )}
            </button>
          )}

          {/* Wake lock toggle */}
          <button
            onClick={() => {
              if (!wakeLockSupported) return;
              if (wakeLockActive) {
                releaseWakeLock();
                showToast("Screen lock off");
              } else {
                requestWakeLock().then(() => showToast("Screen stays on"));
              }
            }}
            disabled={!wakeLockSupported}
            className={cn(
              "flex h-10 items-center gap-1.5 rounded-full px-3",
              !wakeLockSupported
                ? "bg-card text-muted-foreground/40 cursor-not-allowed"
                : wakeLockActive
                ? "bg-primary/20 text-primary"
                : "bg-card text-muted-foreground"
            )}
            aria-label={wakeLockActive ? "Screen lock active" : "Keep screen on"}
            title={!wakeLockSupported ? "Screen wake lock not supported by this browser" : wakeLockActive ? "Screen stays on" : "Tap to keep screen on"}
          >
            {wakeLockActive ? (
              <LightBulbSolid className="h-5 w-5" aria-hidden="true" />
            ) : (
              <LightBulbIcon className="h-5 w-5" aria-hidden="true" />
            )}
            <span className="text-xs font-medium">{wakeLockActive ? "Screen on" : "Screen off"}</span>
          </button>
        </div>
      </div>

      {/* Recipe title */}
      <p className="px-6 text-center text-xs font-medium text-muted-foreground">
        {recipe.title}
      </p>

      {/* Inline video player (YouTube step seek) */}
      {showVideo && videoId && (
        <div className="mx-4 mt-2 aspect-video overflow-hidden rounded-xl bg-black">
          <iframe
            key={`${videoId}-${step.video_timestamp_seconds ?? 0}`}
            src={`https://www.youtube.com/embed/${videoId}?autoplay=1&start=${step.video_timestamp_seconds ?? 0}`}
            title="Recipe video"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="h-full w-full"
          />
        </div>
      )}

      {/* Step content — takes all remaining space */}
      <div className="flex flex-1 flex-col justify-center px-6 py-8">
        {/* Section header (if different from previous step) */}
        {step.section && (currentStep === 0 || step.section !== steps[currentStep - 1]?.section) && (
          <p className="mb-2 text-center text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {step.section}
          </p>
        )}

        {/* Step number */}
        <p className="mb-3 text-center text-sm font-semibold text-primary">
          Step {currentStep + 1} of {steps.length}
        </p>

        {/* Instruction */}
        <p className="text-center text-xl font-medium leading-relaxed text-foreground">
          {step.instruction}
        </p>

        {/* Timer */}
        {step.timer_seconds && (
          <div className="mx-auto mt-8 w-full max-w-xs">
            <StepTimer
              seconds={step.timer_seconds}
              key={step.id} // remount when step changes
            />
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="pb-safe px-6 pb-8">
        {/* Relevant ingredients for this step */}
        <StepIngredients step={step} recipe={recipe} />

        <div className="mt-4 flex gap-3">
          <button
            onClick={prev}
            disabled={isFirst}
            className="flex min-h-touch flex-1 items-center justify-center gap-2 rounded-2xl border border-border bg-card py-4 text-sm font-semibold text-muted-foreground disabled:opacity-30"
            aria-label="Previous step"
          >
            <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
            Prev
          </button>

          {isLast ? (
            <button
              onClick={() => {
                releaseWakeLock();
                router.push(`/recipe/${id}`);
              }}
              className="flex min-h-touch flex-1 items-center justify-center gap-2 rounded-2xl bg-green-600 py-4 text-sm font-bold text-white"
            >
              Finished! 🎉
            </button>
          ) : (
            <button
              onClick={next}
              className="flex min-h-touch flex-1 items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-sm font-bold text-primary-foreground"
              aria-label="Next step"
            >
              Next
              <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

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

// ─── Ingredient hints for current step ───────────────────────────────────────

function StepIngredients({ step, recipe }: { step: Step; recipe: Recipe }) {
  // Naive keyword match: find ingredients mentioned in the step text
  const matches = recipe.ingredients.filter((ing) => {
    const words = ing.name.toLowerCase().split(/\s+/);
    const instruction = step.instruction.toLowerCase();
    return words.some((w) => w.length > 3 && instruction.includes(w));
  });

  if (matches.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        You'll need
      </p>
      <ul className="flex flex-wrap gap-2">
        {matches.map((ing) => (
          <li
            key={ing.id}
            className="rounded-full bg-primary/10 px-3 py-1 text-xs text-primary"
          >
            {ing.amount != null
              ? `${ing.amount}${ing.unit ? ` ${ing.unit}` : ""} `
              : ""}
            {ing.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
