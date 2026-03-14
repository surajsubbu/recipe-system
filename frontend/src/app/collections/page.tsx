"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { collectionsApi } from "@/lib/api";
import type { Collection } from "@/lib/types";
import {
  FolderPlusIcon,
  FolderIcon,
  XMarkIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { PageSpinner } from "@/components/LoadingSpinner";

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
      const result = await collectionsApi.list({}, token);
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
    <div className="px-safe mx-auto max-w-3xl px-4 pt-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Collections</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Organize your recipes into personal cookbooks
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground active:scale-95 transition-transform"
        >
          <FolderPlusIcon className="h-4 w-4" aria-hidden="true" />
          New
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="mb-6 animate-slide-up rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground">New Collection</h2>
            <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">
              <XMarkIcon className="h-4 w-4" />
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
            className="mb-3 w-full rounded-xl border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setShowForm(false)}
              className="flex-1 rounded-xl border border-border py-2 text-sm font-medium text-muted-foreground"
            >
              Cancel
            </button>
            <button
              onClick={createCollection}
              disabled={!newName.trim() || creating}
              className="flex-1 rounded-xl bg-primary py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {creating ? "Creating…" : "Create"}
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </p>
      )}

      {/* Grid */}
      {collections.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <FolderIcon className="mb-3 h-16 w-16 text-muted-foreground/30" aria-hidden="true" />
          <p className="text-lg font-semibold text-foreground">No collections yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create one to organize your favorite recipes
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {collections.map((col, i) => (
            <div
              key={col.id}
              className="group relative animate-fade-up"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <Link
                href={`/collections/${col.id}`}
                className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 transition-all hover:border-secondary/50 hover:shadow-lg hover:shadow-secondary/10"
              >
                {col.cover_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={col.cover_image_url}
                    alt={col.name}
                    className="h-24 w-full rounded-xl object-cover"
                  />
                ) : (
                  <div className="flex h-24 items-center justify-center rounded-xl bg-gradient-to-br from-secondary/20 to-secondary/5">
                    <FolderIcon className="h-10 w-10 text-secondary/60" aria-hidden="true" />
                  </div>
                )}
                <div>
                  <h2 className="font-semibold text-foreground group-hover:text-secondary">
                    {col.name}
                  </h2>
                  {col.description && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      {col.description}
                    </p>
                  )}
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {col.recipe_count} recipe{col.recipe_count !== 1 ? "s" : ""}
                  </p>
                </div>
              </Link>

              {/* Delete button — visible on hover */}
              <button
                onClick={(e) => {
                  e.preventDefault();
                  deleteCollection(col.id);
                }}
                className="absolute right-3 top-3 hidden rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-400 group-hover:flex"
                aria-label={`Delete ${col.name}`}
              >
                <TrashIcon className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
