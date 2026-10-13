/**
 * Supabase connection settings, read from the environment.
 *
 * Both values are safe to expose to the browser: the publishable key only
 * identifies the project, and row level security decides what anyone can do.
 * The service role key is NOT used anywhere in Wagbook, on purpose. See
 * docs/05-security-and-privacy.md.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

/** Newer projects call it the publishable key; older ones the anon key. Either works. */
export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** False until .env.local has been filled in. The app then shows /setup instead of crashing. */
export function isSupabaseConfigured(): boolean {
  return SUPABASE_URL.startsWith("http") && SUPABASE_KEY.length > 20;
}
