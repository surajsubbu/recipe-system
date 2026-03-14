"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { collectionsApi } from "@/lib/api";
import type { Collection } from "@/lib/types";
import {
  FolderPlusIcon,
  XMarkIcon,
  EllipsisVerticalIcon,
} from "@heroicons/react/24/outline";
import { PageSpinner } from "@/components/LoadingSpinner";
import { cn } from "@/lib/utils";

export default function CollectionsPage() {
  const { getToken } = useAuth();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const token = await getToken();
      const result = await collectionsApi.list(token);
      setCollections(result.items);
    } catch {
      setError("Failed to load collections.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function createCollection() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const token = await getToken();
      const col = await collectionsApi.create(
        { name: newName.trim(), description: newDesc.trim() || undefined },
        token
      );
      setCollections((prev) => [col, ...prev]);
      setNewName("");
      setNewDesc("");
      setShowForm(false);
    } catch {
      setError("Failed to create collection.");
    } finally {
      setCreating(false);
    }
  }

  async function deleteCollection(id: number) {
    if (!confirm("Delete this collection? Recipes will not be deleted.")) return;
    try {
      const token = await getToken();
      await collectionsApi.delete(id, token);
      setCollections((prev) => prev.filter((c) => c.id !== id));
    } catch {
      setError("Failed to delete collection.");
    }
  }

  if (loading) return <PageSpinner />;

  return (
    <div className="pb-nav px-safe mx-auto max-w-3xl px-4 pt-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Collections</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Organize your recipes into personal cookbooks
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground active:scale-95 transition-transform"
        >
          <FolderPlusIcon className="h-4 w-4" aria-hidden="true" />
          New
        </button>
      </div>

      {/* Error */}
      {error && (
        <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </p>
      )}

      {/* Grid */}
      {collections.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/30 to-accent">
            <span className="text-3xl">📚</span>
          </div>
          <p className="text-lg font-semibold text-foreground">No collections yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create one to organize your favorite recipes
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {collections.map((col, i) => (
            <CollectionCard
              key={col.id}
              collection={col}
              index={i}
              onDelete={() => deleteCollection(col.id)}
            />
          ))}
        </div>
      )}

      {/* Create bottom sheet */}
      {showForm && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowForm(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="New Collection"
            className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up rounded-t-2xl border-t border-border bg-card px-4 pb-safe pt-4"
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-muted" />
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground">New Collection</h2>
              <button
                onClick={() => setShowForm(false)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Close"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createCollection()}
              placeholder="Collection name*"
              className="mb-2 w-full rounded-xl border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none"
              autoFocus
            />
            <input
              type="text"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Description (optional)"
              className="mb-4 w-full rounded-xl border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none"
            />
            <div className="mb-8 flex gap-2">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium text-muted-foreground"
              >
                Cancel
              </button>
              <button
                onClick={createCollection}
                disabled={!newName.trim() || creating}
                className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {creating ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Collection Card ──────────────────────────────────────────────────────────

function CollectionCard({
  collection: col,
  index,
  onDelete,
}: {
  collection: Collection;
  index: number;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      className="group relative animate-fade-up"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <Link
        href={`/collections/${col.id}`}
        className="relative block overflow-hidden rounded-2xl border border-border bg-card aspect-[4/3] transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10"
      >
        {col.cover_image_url ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={col.cover_image_url}
              alt={col.name}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
          </>
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-primary/30 to-accent">
            <span className="text-5xl font-bold text-foreground/40 uppercase">
              {col.name[0]}
            </span>
          </div>
        )}

        {/* Text overlay */}
        <div className="absolute bottom-3 left-3 right-8">
          <h2 className={cn(
            "font-semibold leading-snug",
            col.cover_image_url ? "text-white" : "text-foreground"
          )}>
            {col.name}
          </h2>
          <p className={cn(
            "text-xs",
            col.cover_image_url ? "text-white/70" : "text-muted-foreground"
          )}>
            {col.recipe_count} recipe{col.recipe_count !== 1 ? "s" : ""}
          </p>
        </div>
      </Link>

      {/* ⋮ menu button */}
      <div className="absolute right-2 top-2">
        <button
          onClick={(e) => {
            e.preventDefault();
            setMenuOpen((v) => !v);
          }}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-opacity"
          aria-label="Collection options"
        >
          <EllipsisVerticalIcon className="h-4 w-4" aria-hidden="true" />
        </button>
        {menuOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setMenuOpen(false)}
              aria-hidden="true"
            />
            <div className="absolute right-0 top-9 z-20 min-w-[120px] rounded-xl border border-border bg-card py-1 shadow-lg">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  setMenuOpen(false);
                  onDelete();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10"
              >
                Delete
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
