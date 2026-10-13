/**
 * Where to send someone after an email link, given the `next` value from the URL.
 *
 * Only ever a path on this site. Checking the string is not enough: browsers
 * read "/\evil.example" and "/<tab>/evil.example" as another site. So the
 * value is resolved the way a browser would resolve it, and kept only if it
 * stays on our origin.
 */
export function safeDestination(next: string | null | undefined, origin: string, fallback = "/app"): string {
  if (!next || !next.startsWith("/")) return fallback;
  try {
    const resolved = new URL(next, origin);
    if (resolved.origin !== new URL(origin).origin) return fallback;
    return `${resolved.pathname}${resolved.search}`;
  } catch {
    return fallback;
  }
}
