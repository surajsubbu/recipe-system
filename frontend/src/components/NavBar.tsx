"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  BookOpenIcon,
  HomeIcon,
  BeakerIcon,
  BookmarkIcon,
  UserCircleIcon,
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
} from "@heroicons/react/24/solid";
import { useUser, useClerk } from "@clerk/nextjs";

const NAV_ITEMS = [
  {
    href: "/",
    label: "Home",
    icon: HomeIcon,
    activeIcon: HomeSolid,
    isActive: (p: string) => p === "/",
  },
  {
    href: "/recipes",
    label: "Recipes",
    icon: BookOpenIcon,
    activeIcon: BookOpenSolid,
    isActive: (p: string) => p === "/recipes" || p.startsWith("/recipe/"),
  },
  {
    href: "/pantry",
    label: "Pantry",
    icon: BeakerIcon,
    activeIcon: BeakerSolid,
    isActive: (p: string) => p.startsWith("/pantry"),
  },
  {
    href: "/collections",
    label: "Saved",
    icon: BookmarkIcon,
    activeIcon: BookmarkSolid,
    isActive: (p: string) => p.startsWith("/collections"),
  },
];

const SECONDARY_ITEMS = [
  { href: "/add", label: "Add Recipe", icon: PlusCircleIcon },
  { href: "/shopping-list", label: "Shopping List", icon: ShoppingCartIcon },
  { href: "/meal-plan", label: "Meal Plan", icon: CalendarIcon },
];

export function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useUser();
  const { signOut } = useClerk();

  // Hide sidebar in fullscreen cook mode
  if (pathname.startsWith("/cook/")) return null;

  const isAdmin = (user?.publicMetadata as { role?: string })?.role === "admin";

  async function handleSignOut() {
    await signOut();
    router.push("/sign-in");
  }

  return (
    <nav className="fixed left-0 top-0 bottom-0 z-50 flex w-16 flex-col border-r border-primary/10 bg-card/98 backdrop-blur-sm md:w-56">
      {/* App header */}
      <div className="flex items-center gap-2.5 border-b border-border px-3 py-5 md:px-4">
        <span className="flex-shrink-0 text-xl">⚡</span>
        <span className="hidden truncate font-heading text-lg font-bold uppercase tracking-widest text-primary md:block">
          Recipes
        </span>
      </div>

      {/* Nav items */}
      <ul className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
        {NAV_ITEMS.map(({ href, label, icon: Icon, activeIcon: ActiveIcon, isActive }) => {
          const active = isActive(pathname);
          return (
            <li key={href}>
              <Link
                href={href}
                title={label}
                className={cn(
                  "flex items-center gap-3 border-l-2 px-3 py-2.5 transition-all duration-150",
                  active
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
                aria-current={active ? "page" : undefined}
              >
                {active ? (
                  <ActiveIcon className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
                ) : (
                  <Icon className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
                )}
                <span className="hidden text-sm font-medium md:inline">{label}</span>
              </Link>
            </li>
          );
        })}

        {/* Divider */}
        <li className="my-1.5">
          <div className="h-px bg-border" />
        </li>

        {/* Secondary items */}
        {SECONDARY_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <li key={href}>
              <Link
                href={href}
                title={label}
                className={cn(
                  "flex items-center gap-3 border-l-2 px-3 py-2.5 transition-all duration-150",
                  active
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <Icon className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
                <span className="hidden text-sm font-medium md:inline">{label}</span>
              </Link>
            </li>
          );
        })}

        {isAdmin && (
          <li>
            <Link
              href="/admin"
              title="Admin"
              className={cn(
                "flex items-center gap-3 border-l-2 px-3 py-2.5 transition-all duration-150",
                pathname === "/admin"
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <ShieldCheckIcon className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
              <span className="hidden text-sm font-medium md:inline">Admin</span>
            </Link>
          </li>
        )}
      </ul>

      {/* User section */}
      <div className="border-t border-border p-2">
        {/* User info — desktop only */}
        {user && (
          <div className="mb-1 hidden items-center gap-2.5 rounded-xl px-3 py-2 md:flex">
            {user.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.imageUrl}
                alt={user.fullName ?? "Avatar"}
                className="h-7 w-7 flex-shrink-0 rounded-full object-cover"
              />
            ) : (
              <UserCircleIcon className="h-7 w-7 flex-shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-foreground">
                {user.fullName ?? user.username ?? "User"}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {user.primaryEmailAddress?.emailAddress}
              </p>
            </div>
          </div>
        )}

        <button
          onClick={handleSignOut}
          title="Sign out"
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-400"
        >
          <ArrowRightStartOnRectangleIcon className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
          <span className="hidden text-sm font-medium md:inline">Sign out</span>
        </button>
      </div>
    </nav>
  );
}
