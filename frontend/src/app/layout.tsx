import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, IBM_Plex_Sans } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { NavBar } from "@/components/NavBar";
import "./globals.css";

const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-heading",
  display: "swap",
});

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-body",
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
  themeColor:          "#0d0d0e",
  viewportFit:         "cover",  // allow content under iPhone notch
};

// ─── Root layout ─────────────────────────────────────────────────────────────

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider
      appearance={{
        // Theme every Clerk component (sign-in footer, user menu, modals) with
        // the Late Night Kitchen palette — Clerk defaults to a light theme.
        variables: {
          colorBackground:              "#141416",
          colorText:                    "#e8e8e8",
          colorTextSecondary:           "#888899",
          colorPrimary:                 "#00ff80",
          colorTextOnPrimaryBackground: "#000000",
          colorInputBackground:         "#1e1e21",
          colorInputText:               "#e8e8e8",
          colorNeutral:                 "#e8e8e8",
          colorDanger:                  "#ff4444",
          borderRadius:                 "0.375rem",
          fontFamily:                   "var(--font-body), 'IBM Plex Sans', sans-serif",
        },
        elements: {
          footer: "bg-card bg-none border-t border-border",
        },
        layout: {
          // Dev keys are intentional for this self-hosted install
          unsafe_disableDevelopmentModeWarnings: true,
        },
      }}
    >
      {/*
        Dark mode is always active — we set the "dark" class here rather than
        toggling it at runtime, because the app is designed dark-only.
      */}
      <html lang="en" className="dark">
        <body className={`${barlowCondensed.variable} ${ibmPlexSans.variable} antialiased`}>
          <NavBar />
          <main className="pb-16 md:ml-56 md:pb-0">
            {children}
          </main>
        </body>
      </html>
    </ClerkProvider>
  );
}
