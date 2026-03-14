import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { NavBar } from "@/components/NavBar";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

// ─── SEO + PWA metadata ───────────────────────────────────────────────────────

export const metadata: Metadata = {
  title: {
    default:  "Recipe Manager",
    template: "%s | Recipe Manager",
  },
  description: "Your self-hosted AI recipe collection.",
  manifest:    "/manifest.json",
  appleWebApp: {
    capable:        true,
    statusBarStyle: "black-translucent",
    title:          "Recipes",
  },
  formatDetection: { telephone: false },
  icons: {
    icon:  [{ url: "/icons/icon-192x192.png", sizes: "192x192" }],
    apple: [{ url: "/icons/icon-180x180.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width:               "device-width",
  initialScale:        1,
  maximumScale:        1,   // prevent double-tap zoom on recipe steps
  userScalable:        false,
  themeColor:          "#111827",
  viewportFit:         "cover",  // allow content under iPhone notch
};

// ─── Root layout ─────────────────────────────────────────────────────────────

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      {/*
        Dark mode is always active — we set the "dark" class here rather than
        toggling it at runtime, because the app is designed dark-only.
      */}
      <html lang="en" className="dark">
        <body className={`${inter.variable} antialiased`}>
          <NavBar />
          <main className="ml-16 md:ml-56">
            {children}
          </main>
        </body>
      </html>
    </ClerkProvider>
  );
}
