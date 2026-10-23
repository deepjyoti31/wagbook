import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeDestination } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";

/**
 * Where links in Supabase's emails land (confirm sign-up, reset a password),
 * and where Google sends people back (M45). Supabase sends either
 * `token_hash` + `type` (the recommended email templates) or `code` (the
 * default templates, and Google). Both are handled. Google refusing, or the
 * person pressing Cancel there, arrives as `error`.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const destination = safeDestination(url.searchParams.get("next"), url.origin);

  const supabase = await createClient();
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const code = url.searchParams.get("code");

  if (url.searchParams.get("error") && !code && !tokenHash) {
    return NextResponse.redirect(new URL("/login?error=google", url.origin));
  }

  let ok = false;
  if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  } else if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  }

  return NextResponse.redirect(new URL(ok ? destination : "/login?error=link", url.origin));
}
