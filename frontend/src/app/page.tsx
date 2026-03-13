/**
 * Home page — redirects to the recipe grid.
 * Full page implementation is in Step 7; this stub satisfies the middleware
 * so the app starts up without a 404 at "/".
 */
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

export default async function RootPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  // TODO Step 7: replace with RecipeGrid page content
  redirect("/recipes");
}
