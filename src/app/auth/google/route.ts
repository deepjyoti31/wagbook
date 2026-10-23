import { NextResponse, type NextRequest } from "next/server";
import { safeDestination } from "@/lib/safe-redirect";
import { googleSignInOn, siteOrigin } from "@/lib/site";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/**
 * "Continue with Google" (M45). Asks Supabase Auth for Google's sign-in page and
 * sends the browser there; Google sends it back to /auth/confirm with a code,
 * which becomes the session. A link, not a form, so the browser's form-action
 * rule (src/lib/csp.ts) never sees a post that ends on another site.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  if (!isSupabaseConfigured()) return NextResponse.redirect(new URL("/setup", url.origin));
  if (!googleSignInOn()) return NextResponse.redirect(new URL("/login", url.origin));

  const origin = await siteOrigin();
  const destination = safeDestination(url.searchParams.get("next"), origin, "/app");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(destination)}`,
      skipBrowserRedirect: true,
    },
  });
  if (error || !data.url) {
    console.error("signInWithOAuth failed", error?.code, error?.message);
    return NextResponse.redirect(new URL("/login?error=google", origin));
  }
  return NextResponse.redirect(data.url);
}
