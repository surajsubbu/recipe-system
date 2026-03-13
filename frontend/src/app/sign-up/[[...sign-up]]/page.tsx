/**
 * Clerk sign-up page — catch-all route handles:
 *   /sign-up
 *   /sign-up/verify-email-address
 *   /sign-up/continue
 *   etc.
 */
import { SignUp } from "@clerk/nextjs";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign Up",
};

export default function SignUpPage() {
  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-foreground tracking-tight">
            🍳 Recipe Manager
          </h1>
          <p className="mt-2 text-muted-fg text-sm">
            Create your account to get started
          </p>
        </div>

        <div className="flex justify-center">
          <SignUp
            appearance={{
              elements: {
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
            signInUrl="/sign-in"
          />
        </div>
      </div>
    </main>
  );
}
