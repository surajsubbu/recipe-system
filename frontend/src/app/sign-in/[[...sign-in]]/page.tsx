/**
 * Clerk sign-in page — catch-all route handles:
 *   /sign-in
 *   /sign-in/sso-callback
 *   /sign-in/factor-one
 *   /sign-in/factor-two
 *   etc.
 */
import { SignIn } from "@clerk/nextjs";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In",
};

export default function SignInPage() {
  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-4">
      {/* App branding above the Clerk widget */}
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-foreground tracking-tight">
            🍳 Recipe Manager
          </h1>
          <p className="mt-2 text-muted-fg text-sm">
            Your self-hosted AI recipe collection
          </p>
        </div>

        <div className="flex justify-center">
          <SignIn
            appearance={{
              elements: {
                /* Match our dark color tokens */
                rootBox:       "w-full",
                card:          "bg-card border border-border shadow-xl rounded-lg",
                headerTitle:   "text-foreground",
                headerSubtitle:"text-muted-fg",
                formFieldLabel:"text-foreground",
                formFieldInput:
                  "bg-input border-border text-foreground placeholder:text-muted-fg focus:ring-primary",
                footerActionLink: "text-primary hover:text-primary/80",
                socialButtonsBlockButton:
                  "border-border text-foreground hover:bg-accent",
                dividerLine: "bg-border",
                dividerText: "text-muted-fg",
              },
            }}
            redirectUrl="/"
            signUpUrl="/sign-up"
          />
        </div>
      </div>
    </main>
  );
}
