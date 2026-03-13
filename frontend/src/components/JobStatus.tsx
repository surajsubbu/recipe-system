"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { ingestApi } from "@/lib/api";
import type { IngestJobOut } from "@/lib/types";
import { cn } from "@/lib/utils";
import { LoadingSpinner } from "./LoadingSpinner";
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
} from "@heroicons/react/24/solid";

interface JobStatusProps {
  jobId: string;
  onDone?: (recipeId: number) => void;
  onError?: (error: string) => void;
  className?: string;
}

const POLL_INTERVAL_MS = 2000;

export function JobStatus({
  jobId,
  onDone,
  onError,
  className,
}: JobStatusProps) {
  const { getToken } = useAuth();
  const [job, setJob] = useState<IngestJobOut | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let active = true;

    async function poll() {
      try {
        const token = await getToken();
        const data = await ingestApi.status(jobId, token);
        if (!active) return;
        setJob(data);

        if (data.status === "done") {
          stopPolling();
          if (data.recipe_id) onDone?.(data.recipe_id);
        } else if (data.status === "failed") {
          stopPolling();
          onError?.(data.error ?? "Ingest failed");
        }
      } catch {
        // network error — keep polling
      }
    }

    function stopPolling() {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }

    poll();
    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      active = false;
      stopPolling();
    };
  }, [jobId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!job) {
    return (
      <div className={cn("flex items-center gap-3", className)}>
        <LoadingSpinner size="sm" />
        <span className="text-sm text-muted-foreground">Starting…</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border p-4",
        job.status === "done" && "border-green-500/30 bg-green-500/10",
        job.status === "failed" && "border-red-500/30 bg-red-500/10",
        (job.status === "pending" || job.status === "running") &&
          "border-border bg-muted",
        className
      )}
      role="status"
      aria-live="polite"
    >
      {job.status === "done" && (
        <CheckCircleIcon className="h-5 w-5 flex-shrink-0 text-green-400" aria-hidden="true" />
      )}
      {job.status === "failed" && (
        <ExclamationCircleIcon className="h-5 w-5 flex-shrink-0 text-red-400" aria-hidden="true" />
      )}
      {(job.status === "pending" || job.status === "running") && (
        <LoadingSpinner size="sm" label="" />
      )}

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium capitalize text-foreground">
          {job.status === "running" ? "Processing" : job.status}
        </p>
        {job.progress && (
          <p className="truncate text-xs text-muted-foreground">
            {job.progress}
          </p>
        )}
        {job.error && (
          <p className="text-xs text-red-400">{job.error}</p>
        )}
      </div>
    </div>
  );
}

// ─── Inline progress bar variant ─────────────────────────────────────────────

const PROGRESS_STEPS = [
  "fetching",
  "extracting",
  "normalizing",
  "saving",
  "done",
];

function stepIndex(progress: string | null): number {
  if (!progress) return 0;
  const lc = progress.toLowerCase();
  return PROGRESS_STEPS.findIndex((s) => lc.includes(s));
}

export function JobProgressBar({ job }: { job: IngestJobOut }) {
  const idx = Math.max(0, stepIndex(job.progress));
  const pct =
    job.status === "done"
      ? 100
      : job.status === "failed"
      ? 0
      : Math.round(((idx + 1) / PROGRESS_STEPS.length) * 100);

  return (
    <div className="space-y-1">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            job.status === "failed" ? "bg-red-500" : "bg-primary"
          )}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
      <p className="text-xs text-muted-foreground">{job.progress ?? "Queued…"}</p>
    </div>
  );
}
