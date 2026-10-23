import type { Instrumentation } from "next";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Errors on the server, written down for the kennel's owners (M48): More,
 * Problems. Only for someone signed in, as that person (the database decides
 * which kennel, scrubs the message and stops a flood: log_app_error()). The
 * service role key is never used, so an error on a public page is only in the
 * server's own log. Writing it down must never cause a second error.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const digest = typeof error === "object" && error !== null && "digest" in error ? String(error.digest) : undefined;
    const { isControlFlow, scrubErrorText } = await import("@/lib/core/problems");
    if (isControlFlow(digest)) return;
    const { isSupabaseConfigured, SUPABASE_KEY, SUPABASE_URL } = await import("@/lib/supabase/env");
    if (!isSupabaseConfigured()) return;
    const cookieHeader = request.headers.cookie;
    const cookieText = Array.isArray(cookieHeader) ? cookieHeader.join("; ") : (cookieHeader ?? "");
    if (!cookieText) return;

    const { createServerClient, parseCookieHeader } = await import("@supabase/ssr");
    const cookies = parseCookieHeader(cookieText).map((c) => ({ name: c.name, value: c.value ?? "" }));
    const supabase = createServerClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
      cookies: { getAll: () => cookies, setAll: () => {} },
    });
    const { data } = await supabase.auth.getClaims();
    if (!data?.claims?.sub) return;
    const org = cookies.find((c) => c.name === "wb_org")?.value ?? null;
    const message = error instanceof Error ? `${error.name === "Error" ? "" : `${error.name}: `}${error.message}` : String(error);
    await supabase.rpc("log_app_error", {
      p_path: request.path,
      p_kind: context.routeType,
      p_message: scrubErrorText(message) || "?",
      ...(org && /^[0-9a-f-]{36}$/.test(org) ? { p_org: org } : {}),
      ...(digest ? { p_digest: digest } : {}),
    });
  } catch (e) {
    console.error("Could not write the problem down", e);
  }
};
