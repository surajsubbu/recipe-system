"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { ingestApi } from "@/lib/api";
import type { IngestJobOut } from "@/lib/types";
import { JobStatus } from "@/components/JobStatus";
import { isYouTubeUrl, isInstagramUrl } from "@/lib/utils";
import { LinkIcon, ArrowRightIcon } from "@heroicons/react/24/outline";

function SiteFavicon({ domain, alt }: { domain: string; alt: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
      alt={alt}
      width={16}
      height={16}
      className="h-4 w-4 rounded-sm"
    />
  );
}

const SUPPORTED_SOURCES = [
  { domain: "youtube.com",    label: "YouTube",     text: "Cooking videos (any language)" },
  { domain: "instagram.com",  label: "Instagram",   text: "Reels & posts" },
  { domain: "allrecipes.com", label: "AllRecipes",  text: "AllRecipes" },
  { domain: "seriouseats.com",label: "Serious Eats",text: "Serious Eats" },
  { domain: "minimalistbaker.com", label: "Minimalist Baker", text: "Minimalist Baker" },
  { domain: "ohsheglows.com",     label: "Oh She Glows",     text: "Oh She Glows" },
  { domain: "food52.com",     label: "Food52",      text: "Food52 & most recipe blogs" },
];

export default function AddPage() {
  const router = useRouter();
  const { getToken } = useAuth();
  const [url, setUrl] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isYT = isYouTubeUrl(url);
  const isIG = isInstagramUrl(url);
  const isValidUrl = (() => {
    try { new URL(url); return true; } catch { return false; }
  })();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidUrl) return;
    setSubmitting(true);
    setError(null);
    setJobId(null);
    try {
      const token = await getToken();
      const result = await ingestApi.start({ url }, token);
      setJobId(result.job_id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to start import");
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

  const urlHint = isYT
    ? { domain: "youtube.com", label: "YouTube", text: "Video detected — subtitles or audio transcription used to extract the recipe." }
    : isIG
    ? { domain: "instagram.com", label: "Instagram", text: "Reel detected — recipe extracted from caption and audio." }
    : null;

  return (
    <div className="px-safe mx-auto max-w-lg px-4 pt-8">
      <h1 className="mb-2 text-2xl font-bold text-foreground">Add Recipe</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Paste a link from YouTube, Instagram, or any recipe site. AI extracts
        everything automatically.
      </p>

      {/* Input form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="relative">
          <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
            {isYT ? (
              <SiteFavicon domain="youtube.com" alt="YouTube" />
            ) : isIG ? (
              <SiteFavicon domain="instagram.com" alt="Instagram" />
            ) : (
              <LinkIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
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
            aria-label="Recipe URL"
          />
        </div>

        {/* URL type hint */}
        {url && isValidUrl && urlHint && (
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <SiteFavicon domain={urlHint.domain} alt={urlHint.label} />
            <span>{urlHint.text}</span>
          </div>
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
          {!submitting && <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />}
        </button>
      </form>

      {/* Job tracking */}
      {jobId && (
        <div className="mt-6 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Import Progress</h2>
          <JobStatus jobId={jobId} onDone={handleDone} onError={handleError} />
        </div>
      )}

      {/* Supported sources */}
      {!jobId && (
        <div className="mt-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Works with
          </h2>
          <ul className="space-y-2.5">
            {SUPPORTED_SOURCES.map(({ domain, label, text }) => (
              <li key={domain} className="flex items-center gap-2.5 text-sm text-muted-foreground">
                <SiteFavicon domain={domain} alt={label} />
                <span>
                  <span className="font-medium text-foreground">{label}</span>
                  {" — "}
                  {text}
                </span>
              </li>
            ))}
            <li className="flex items-center gap-2.5 text-sm text-muted-foreground">
              <span className="flex h-4 w-4 items-center justify-center text-xs" aria-hidden="true">🤖</span>
              <span>
                <span className="font-medium text-foreground">Anywhere else</span>
                {" — "}
                AI fallback extracts from any page
              </span>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
