const withPWA = require("@ducanh2912/next-pwa").default({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  // Disable SW in development — hot reload and service workers conflict
  disable: process.env.NODE_ENV === "development",
  workboxOptions: {
    disableDevLogs: true,
    // Precache all pages and static assets
    runtimeCaching: [
      {
        // Cache recipe images from any origin
        urlPattern: /^https?:\/\/.*\.(png|jpg|jpeg|webp|svg|gif)$/i,
        handler: "CacheFirst",
        options: {
          cacheName: "recipe-images",
          expiration: { maxEntries: 200, maxAgeSeconds: 7 * 24 * 60 * 60 },
        },
      },
      {
        // Cache API GET requests for offline recipe browsing
        urlPattern: ({ url }) => url.pathname.startsWith("/recipes"),
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "api-recipes",
          expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 },
        },
      },
    ],
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Proxy /backend/* → backend container (avoids needing a second Cloudflare tunnel hostname)
  async rewrites() {
    return [
      {
        source: "/backend/:path*",
        destination: "http://backend:8000/:path*",
      },
    ];
  },

  // Allow images from any remote host (recipe images come from many domains)
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http",  hostname: "**" },
    ],
  },

  // Needed for standalone Docker production builds (not used in dev)
  // output: "standalone",
};

module.exports = withPWA(nextConfig);
