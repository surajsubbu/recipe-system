"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth, useUser, useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { recipesApi, pantryApi } from "@/lib/api";
import type { RecipeSummary } from "@/lib/types";
import { RecipeCard, RecipeCardSkeleton } from "@/components/RecipeCard";
import { BeakerIcon, PlusCircleIcon, UserCircleIcon } from "@heroicons/react/24/outline";

const FALLBACK_CUISINES = [
  { label: "🍝 Italian", q: "italian" },
  { label: "🍜 Asian", q: "asian" },
  { label: "🌮 Mexican", q: "mexican" },
  { label: "🫕 Indian", q: "indian" },
  { label: "🥗 Healthy", q: "healthy" },
  { label: "⚡ Quick", q: "quick" },
];

const CUISINE_EMOJIS: Record<string, string> = {
  italian: "🍝", asian: "🍜", mexican: "🌮", indian: "🫕",
  chinese: "🥡", japanese: "🍣", thai: "🍛", french: "🥐",
  greek: "🥙", korean: "🍲", mediterranean: "🫒", american: "🍔",
  spanish: "🥘", vietnamese: "🍜", "middle eastern": "🧆",
};

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function HomePage() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const { signOut } = useClerk();
  const router = useRouter();
  const [recipes, setRecipes] = useState<RecipeSummary[]>([]);
  const [pantryCount, setPantryCount] = useState<number | null>(null);
  const [cuisines, setCuisines] = useState<{ label: string; q: string }[]>(FALLBACK_CUISINES);
  const [loading, setLoading] = useState(true);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [greetingText, setGreetingText] = useState("");

  useEffect(() => {
    setGreetingText(greeting());
  }, []);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    (async () => {
      try {
        const token = await getToken();
        const [recipeData, pantryData, cuisineData] = await Promise.all([
          recipesApi.list({ page: 1, page_size: 6 }, token),
          pantryApi.list(token),
          recipesApi.cuisines(token).catch(() => []),
        ]);
        setRecipes(recipeData.items);
        const count = Object.values(pantryData).reduce(
          (sum, items) => sum + items.length,
          0
        );
        setPantryCount(count);
        if (cuisineData.length > 0) {
          setCuisines(
            cuisineData.map((c) => {
              const lower = c.cuisine.toLowerCase();
              const emoji = CUISINE_EMOJIS[lower] || "🍽️";
              return { label: `${emoji} ${c.cuisine}`, q: lower };
            })
          );
        }
      } catch {
        // silently ignore — pages still render with defaults
      } finally {
        setLoading(false);
      }
    })();
  }, [isLoaded, isSignedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  const firstName = user?.firstName ?? user?.username ?? null;

  async function handleSignOut() {
    await signOut();
    router.push("/sign-in");
  }

  return (
    <div className="px-4 pt-6 mx-auto max-w-3xl pb-8">
      {/* ── Greeting ─────────────────────────────────────────────────── */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {greetingText}{firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">What are you cooking today?</p>
        </div>
        {/* Avatar — tapping opens sign-out menu */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu((v) => !v)}
            className="focus:outline-none"
            aria-label="User menu"
          >
            {user?.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.imageUrl}
                alt={user.fullName ?? "Avatar"}
                className="h-10 w-10 rounded-full object-cover ring-2 ring-primary/30"
              />
            ) : user ? (
              <UserCircleIcon className="h-10 w-10 text-muted-foreground" />
            ) : null}
          </button>
          {showUserMenu && (
            <>
              {/* Backdrop */}
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowUserMenu(false)}
              />
              {/* Dropdown */}
              <div className="absolute right-0 top-12 z-20 min-w-[160px] rounded-xl border border-border bg-card shadow-lg">
                <div className="border-b border-border px-4 py-2.5">
                  <p className="text-xs font-semibold text-foreground truncate max-w-[140px]">
                    {user?.fullName ?? user?.username ?? "User"}
                  </p>
                  <p className="text-xs text-muted-foreground truncate max-w-[140px]">
                    {user?.primaryEmailAddress?.emailAddress}
                  </p>
                </div>
                <button
                  onClick={handleSignOut}
                  className="w-full px-4 py-2.5 text-left text-sm text-red-400 hover:bg-red-500/10 rounded-b-xl transition-colors"
                >
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Action cards row ─────────────────────────────────────────── */}
      <div className="mb-6 flex gap-3">
        {/* Cook from Pantry */}
        {pantryCount !== null && pantryCount > 0 ? (
          <Link
            href="/pantry/cook"
            className="flex-1 flex flex-col justify-between rounded-2xl bg-gradient-to-br from-primary/80 to-orange-600/60 p-4 transition-all hover:opacity-90 active:scale-[0.98]"
          >
            <p className="text-base font-bold text-white leading-snug">What can I cook tonight?</p>
            <p className="mt-1 text-xs text-white/80">
              {pantryCount} item{pantryCount !== 1 ? "s" : ""} in pantry
            </p>
            <span className="mt-3 self-start rounded-xl bg-white/20 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm">
              Find Recipes →
            </span>
          </Link>
        ) : (
          <Link
            href="/pantry"
            className="flex-1 flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
          >
            <BeakerIcon className="h-5 w-5 flex-shrink-0 text-primary/60" aria-hidden="true" />
            <span className="text-xs">Add pantry items to find recipe matches</span>
          </Link>
        )}

        {/* Add Recipe */}
        <Link
          href="/add"
          className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/50 hover:text-primary min-w-[90px]"
        >
          <PlusCircleIcon className="h-7 w-7 text-primary" aria-hidden="true" />
          <span className="text-xs font-medium text-foreground text-center leading-tight">Add Recipe</span>
        </Link>
      </div>

      {/* ── Browse by Cuisine ─────────────────────────────────────────── */}
      <div className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Browse by Cuisine
        </h2>
        <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
          {cuisines.map(({ label, q }) => (
            <Link
              key={q}
              href={`/recipes?cuisine=${encodeURIComponent(q)}`}
              className="flex-shrink-0 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/50 hover:text-primary"
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      {/* ── Recent Recipes ────────────────────────────────────────────── */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Recently Added
          </h2>
          <Link
            href="/recipes"
            className="text-xs font-medium text-primary hover:underline"
          >
            See all →
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <RecipeCardSkeleton key={i} />
            ))}
          </div>
        ) : recipes.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {recipes.map((recipe) => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                className="animate-fade-up"
              />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">No recipes yet.</p>
            <Link
              href="/add"
              className="mt-3 inline-block rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              Add your first recipe
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
