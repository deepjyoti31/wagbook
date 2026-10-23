/**
 * Errors on the server, written down for owners to see (M48).
 *
 * The same scrubbing runs again in the database (scrub_error_text() in
 * supabase/migrations/20261008000750_operations.sql), so a row can never hold
 * a parent's email address or phone number, whoever writes it.
 */

/**
 * Email addresses and phone numbers replaced, cut to 300 characters. A phone
 * number is nine or more digits, each followed by at most one space, bracket
 * or hyphen; a date (eight digits) is kept.
 */
export function scrubErrorText(text: string): string {
  return text
    .replace(/[^\s@<>"']+@[^\s@<>"']+/g, "[email]")
    .replace(/\+?(?:[0-9][ ()-]?){8,}[0-9]/g, "[number]")
    .slice(0, 300);
}

/**
 * True for what Next.js throws on purpose to move a request along (redirect(),
 * notFound(), a page that turned out to be dynamic): not a problem.
 */
export function isControlFlow(digest: string | undefined): boolean {
  return Boolean(digest && /^(NEXT_REDIRECT|NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK|DYNAMIC_SERVER_USAGE|BAILOUT_TO_CLIENT_SIDE_RENDERING|HANGING_PROMISE_REJECTION)/.test(digest));
}
