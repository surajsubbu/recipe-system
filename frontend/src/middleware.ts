/**
 * Clerk authentication middleware.
 *
 * All routes are protected by default.
 * Public routes (sign-in, sign-up, and PWA assets) are explicitly whitelisted.
 *
 * Clerk's clerkMiddleware() attaches auth state to every request so that
 * server components can call auth() without any additional setup.
 */
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Routes that do NOT require a signed-in user
const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  // Clerk dev-browser handshake — middleware rewrites to /clerk_<nonce> in
  // development; this route must be public or it creates a redirect loop.
  "/clerk_(.*)",
  // Static assets — Next.js serves these automatically but matching them
  // here ensures they bypass the Clerk redirect loop.
  "/icons(.*)",
  "/manifest.json",
  "/sw.js",
  "/workbox-(.*)",
]);

export default clerkMiddleware((auth, req) => {
  if (!isPublicRoute(req)) {
    // Redirect unauthenticated users to /sign-in
    auth().protect();
  }
});

export const config = {
  // Match every route except Next.js internals and static files
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
    "/(api|trpc)(.*)",
  ],
};
