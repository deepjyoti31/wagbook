import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeDestination } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";

/**
 * Where links in Supabase's emails land (confirm sign-up, magic link, reset).
 * Supabase sends either `token_hash` + `type` (the recommended email template)
 * or `code` (the default template). Both are handled.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const destination = safeDestination(url.searchParams.get("next"), url.origin);

  const supabase = await createClient();
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const code = url.searchParams.get("code");

  let ok = false;
  if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  } else if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  }

  return NextResponse.redirect(new URL(ok ? destination : "/login?error=link", url.origin));
}
