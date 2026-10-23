import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "./database.types";
import { SUPABASE_KEY, SUPABASE_URL } from "./env";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 * It carries the signed-in user's session from cookies, so every query runs
 * as that user and row level security applies.
 *
 * Create a new client per request. Never keep one in a module variable.
 */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Server Components cannot write cookies. That is fine: src/proxy.ts
          // refreshes the session on every request.
        }
      },
    },
  });
}

/**
 * Supabase client with no session, for the public pages (/i, /s, /inv).
 * It can only call the functions granted to the anonymous role.
 *
 * With `stayToken`, every request carries the stay's secret in the
 * x-wagbook-stay header. Storage passes it to the database, where
 * stay_media_visible() lets that one stay's shared photos be read.
 * With `intakeToken`, the secret of an intake form just sent goes in the
 * x-wagbook-intake header, and intake_upload_allowed() lets its certificates
 * be added. With `linkToken`, a parent's own link secret goes in the
 * x-wagbook-link header, and intake_upload_allowed() lets the photo of a
 * delivery problem they just told be added (M59).
 */
export function createAnonClient(opts: { stayToken?: string; intakeToken?: string; linkToken?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.stayToken) headers["x-wagbook-stay"] = opts.stayToken;
  if (opts.intakeToken) headers["x-wagbook-intake"] = opts.intakeToken;
  if (opts.linkToken) headers["x-wagbook-link"] = opts.linkToken;
  return createPlainClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: Object.keys(headers).length > 0 ? { headers } : undefined,
  });
}
