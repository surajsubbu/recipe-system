"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { ingestApi } from "@/lib/api";
import type { IngestJobOut } from "@/lib/types";
import { JobStatus, JobProgressBar } from "@/components/JobStatus";
import { isYouTubeUrl } from "@/lib/utils";
import {
  LinkIcon,
  PlayCircleIcon,
  ArrowRightIcon,
} from "@heroicons/react/24/outline";

export default function AddPage() {
  const router = useRouter();
  const { getToken } = useAuth();
  const [url, setUrl] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<IngestJobOut | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isYT = isYouTubeUrl(url);
  const isValidUrl = (() => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  })();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidUrl) return;
    setSubmitting(true);
    setError(null);
    setJobId(null);
    setJob(null);
    try {
      const token = await getToken();
      const result = await ingestApi.start({ url }, token);
      setJobId(result.job_id);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to start ingest";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  function handleDone(recipeId: number) {
    router.push(`/recipe/${recipeId}`);
  }

  function handleError(msg: string) {
    setError(msg);
    setJobId(null);
  }

  return (
    <div className="px-safe mx-auto max-w-lg px-4 pt-8">
      <h1 className="mb-2 text-2xl font-bold text-foreground">Add Recipe</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Paste a recipe URL or YouTube video link. The AI will extract all the
        details automatically.
      </p>

      {/* Input form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="relative">
          <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
            {isYT ? (
              <PlayCircleIcon className="h-5 w-5 text-red-400" aria-hidden="true" />
            ) : (
              <LinkIcon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            )}
          </div>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            required
            disabled={!!jobId}
            className="w-full rounded-xl border border-border bg-muted py-3 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
            aria-label="Recipe or YouTube URL"
          />
        </div>

        {/* URL type hint */}
        {url && isValidUrl && (
          <p className="text-xs text-muted-foreground">
            {isYT
              ? "📹 YouTube video detected — we'll transcribe the audio if subtitles aren't available."
              : "🌐 Recipe URL detected — we'll scrape and extract the ingredients and steps."}
          </p>
        )}

        {error && (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={!isValidUrl || submitting || !!jobId}
          className="flex min-h-touch w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Starting…" : "Import Recipe"}
          {!submitting && (
            <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </form>

      {/* Job tracking */}
      {jobId && (
        <div className="mt-6 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">
            Import Progress
          </h2>
          <JobStatus
            jobId={jobId}
            onDone={handleDone}
            onError={handleError}
          />
        </div>
      )}

      {/* Supported sites info */}
      {!jobId && (
        <div className="mt-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Works with
          </h2>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {[
              { icon: "📹", text: "YouTube cooking videos (any language)" },
              {
                icon: "🌐",
                text: "Most recipe sites (AllRecipes, Serious Eats, etc.)",
              },
              { icon: "📝", text: "Food blogs with structured recipe data" },
              { icon: "🤖", text: "Any page — AI fallback extracts from text" },
            ].map(({ icon, text }) => (
              <li key={text} className="flex items-center gap-2">
                <span aria-hidden="true">{icon}</span>
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
