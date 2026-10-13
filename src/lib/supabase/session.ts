import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./database.types";
import { isSupabaseConfigured, SUPABASE_KEY, SUPABASE_URL } from "./env";

/** Paths that need a signed-in user. Everything else is public. */
const PROTECTED = ["/app", "/onboarding"];

/**
 * Runs on every request (see src/proxy.ts). Two jobs:
 *   1. Refresh the Supabase session cookie when it is close to expiring.
 *   2. Send signed-out visitors away from protected pages early.
 *
 * This is a convenience, not the security boundary. Every page and action
 * checks the user again (src/lib/auth.ts), and the database enforces row
 * level security whatever the app does.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  if (!isSupabaseConfigured()) return response;

  const supabase = createServerClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  // Do not put any code between creating the client and this call: it is what
  // refreshes the session, and skipping it logs people out at random.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);

  const path = request.nextUrl.pathname;
  if (!signedIn && PROTECTED.some((p) => path === p || path.startsWith(`${p}/`))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}
