import type { Config } from "tailwindcss";

const config: Config = {
  // Always-on dark mode via the "dark" class on <html>
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Semantic color tokens — maps to CSS variables defined in globals.css
        background:  "hsl(var(--background) / <alpha-value>)",
        foreground:  "hsl(var(--foreground) / <alpha-value>)",
        card:        "hsl(var(--card) / <alpha-value>)",
        // Both forms so utility classes like text-card-foreground and text-card-fg both work
        "card-fg":              "hsl(var(--card-foreground) / <alpha-value>)",
        "card-foreground":      "hsl(var(--card-foreground) / <alpha-value>)",
        border:      "hsl(var(--border) / <alpha-value>)",
        input:       "hsl(var(--input) / <alpha-value>)",
        primary:     "hsl(var(--primary) / <alpha-value>)",
        "primary-fg":           "hsl(var(--primary-foreground) / <alpha-value>)",
        "primary-foreground":   "hsl(var(--primary-foreground) / <alpha-value>)",
        muted:       "hsl(var(--muted) / <alpha-value>)",
        "muted-fg":             "hsl(var(--muted-foreground) / <alpha-value>)",
        "muted-foreground":     "hsl(var(--muted-foreground) / <alpha-value>)",
        accent:      "hsl(var(--accent) / <alpha-value>)",
        destructive: "hsl(var(--destructive) / <alpha-value>)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      // Minimum 44 × 44 px touch targets (WCAG 2.5.5)
      minHeight: { touch: "44px" },
      minWidth:  { touch: "44px" },
      // Safe-area insets for mobile notch / home bar
      spacing: {
        safe: "env(safe-area-inset-bottom, 0px)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
