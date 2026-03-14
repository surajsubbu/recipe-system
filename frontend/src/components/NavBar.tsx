"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  BookOpenIcon,
  HomeIcon,
  BeakerIcon,
  BookmarkIcon,
  UserCircleIcon,
  XMarkIcon,
  ArrowRightStartOnRectangleIcon,
  ShoppingCartIcon,
  CalendarIcon,
  PlusCircleIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import {
  BookOpenIcon as BookOpenSolid,
  HomeIcon as HomeSolid,
  BeakerIcon as BeakerSolid,
  BookmarkIcon as BookmarkSolid,
  UserCircleIcon as UserCircleSolid,
} from "@heroicons/react/24/solid";
import { useUser, useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

const NAV_ITEMS = [
  {
    href: "/",
    label: "Home",
    icon: HomeIcon,
    activeIcon: HomeSolid,
    isActive: (pathname: string) => pathname === "/",
  },
  {
    href: "/recipes",
    label: "Recipes",
    icon: BookOpenIcon,
    activeIcon: BookOpenSolid,
    isActive: (pathname: string) =>
      pathname === "/recipes" || pathname.startsWith("/recipe/"),
  },
  {
    href: "/pantry",
    label: "Pantry",
    icon: BeakerIcon,
    activeIcon: BeakerSolid,
    isActive: (pathname: string) => pathname.startsWith("/pantry"),
  },
  {
    href: "/collections",
    label: "Saved",
    icon: BookmarkIcon,
    activeIcon: BookmarkSolid,
    isActive: (pathname: string) => pathname.startsWith("/collections"),
  },
];

export function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useUser();
  const { signOut } = useClerk();
  const [showAccount, setShowAccount] = useState(false);

  // Hide nav in cook mode (fullscreen)
  if (pathname.startsWith("/cook/")) return null;

  const isAdmin =
    (user?.publicMetadata as { role?: string })?.role === "admin";
  const isAccountActive = showAccount;

  async function handleSignOut() {
    await signOut();
    router.push("/sign-in");
  }

  return (
    <>
      {/* ── Bottom Navigation ─────────────────────────────────────────── */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-sm pb-safe">
        <ul className="flex items-center justify-around px-2">
          {NAV_ITEMS.map(({ href, label, icon: Icon, activeIcon: ActiveIcon, isActive }) => {
            const active = isActive(pathname);
            return (
              <li key={href} className="flex-1">
                <Link
                  href={href}
                  className={cn(
                    "flex min-h-touch flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-2 text-xs font-medium transition-colors",
                    active
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  {active ? (
                    <ActiveIcon className="h-6 w-6" aria-hidden="true" />
                  ) : (
                    <Icon className="h-6 w-6" aria-hidden="true" />
                  )}
                  <span>{label}</span>
                </Link>
              </li>
            );
          })}

          {/* Account tab */}
          <li className="flex-1">
            <button
              onClick={() => setShowAccount(true)}
              className={cn(
                "flex min-h-touch w-full flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-2 text-xs font-medium transition-colors",
                isAccountActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
              aria-label="Account"
            >
              {user?.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.imageUrl}
                  alt={user.fullName ?? "Account"}
                  className="h-6 w-6 rounded-full object-cover"
                />
              ) : isAccountActive ? (
                <UserCircleSolid className="h-6 w-6" aria-hidden="true" />
              ) : (
                <UserCircleIcon className="h-6 w-6" aria-hidden="true" />
              )}
              <span>Account</span>
            </button>
          </li>
        </ul>
      </nav>

      {/* ── Account Sheet ─────────────────────────────────────────────── */}
      {showAccount && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowAccount(false)}
            aria-hidden="true"
          />

          {/* Sheet */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Account"
            className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up rounded-t-2xl border-t border-border bg-card px-4 pb-safe pt-4"
          >
            {/* Handle */}
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-muted" />

            {/* Header */}
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">Account</h2>
              <button
                onClick={() => setShowAccount(false)}
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label="Close"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            {/* User info */}
            {user && (
              <div className="mb-4 flex items-center gap-3 rounded-xl bg-muted p-3">
                {user.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.imageUrl}
                    alt={user.fullName ?? "Avatar"}
                    className="h-12 w-12 rounded-full object-cover"
                  />
                ) : (
                  <UserCircleIcon className="h-12 w-12 text-muted-foreground" />
                )}
                <div className="min-w-0">
                  <p className="truncate font-semibold text-foreground">
                    {user.fullName ?? user.username ?? "User"}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {user.primaryEmailAddress?.emailAddress}
                  </p>
                  {isAdmin && (
                    <span className="mt-0.5 inline-block rounded-full bg-primary/20 px-2 py-0.5 text-xs font-medium text-primary">
                      Admin
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Quick nav links */}
            <div className="mb-4 space-y-1">
              {[
                { href: "/add", label: "Add Recipe", icon: PlusCircleIcon },
                { href: "/shopping-list", label: "Shopping List", icon: ShoppingCartIcon },
                { href: "/meal-plan", label: "Meal Plan", icon: CalendarIcon },
                ...(isAdmin ? [{ href: "/admin", label: "Admin", icon: ShieldCheckIcon }] : []),
              ].map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setShowAccount(false)}
                  className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                  {label}
                </Link>
              ))}
            </div>

            {/* Sign Out */}
            <button
              onClick={handleSignOut}
              className="mb-8 flex w-full items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/20"
            >
              <ArrowRightStartOnRectangleIcon className="h-5 w-5" aria-hidden="true" />
              Sign out
            </button>
          </div>
        </>
      )}
    </>
  );
}
