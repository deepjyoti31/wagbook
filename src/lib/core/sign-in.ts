/** How a sign-in session began, from the claims Supabase Auth puts in it (M45). */

/**
 * True when the session was made by a reset password link within the last
 * hour (M45): Supabase Auth names how a session began in its `amr` claim, and
 * a reset link's is "recovery". Only such a session may set a password
 * without giving the current one.
 */
export function madeByResetLink(claims: { amr?: unknown } | null | undefined, now: number = Date.now()): boolean {
  if (!claims || !Array.isArray(claims.amr)) return false;
  return claims.amr.some(
    (a: unknown) =>
      typeof a === "object" && a !== null && (a as { method?: unknown }).method === "recovery" &&
      typeof (a as { timestamp?: unknown }).timestamp === "number" && now / 1000 - (a as { timestamp: number }).timestamp < 3600,
  );
}
