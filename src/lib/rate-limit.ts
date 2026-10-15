/**
 * Limits at the edge of the app (roadmap M9): how often one address may post
 * the forms that strangers can reach, and how large any post may be.
 *
 * src/proxy.ts applies these before a request reaches a page or a Server
 * Action. A post over its rate is not refused outright: the proxy marks it
 * (RATE_LIMITED_HEADER) and the action answers with a plain sentence in the
 * reader's language, without calling the database. An oversized post is
 * refused with 413.
 *
 * The counts live in the memory of one server process. On one server (the
 * Docker Compose setup in docs/14-self-hosting.md) that is exact. On a host
 * that runs many copies (Vercel), each copy counts on its own, so the real
 * limit is higher; add the host's own rate limiting there (see
 * docs/05-security-and-privacy.md). Whoever calls Supabase directly, skipping
 * the app, is not counted here at all: the database's own limits
 * (submit_intake) and Supabase Auth's limits apply to them.
 */

export interface RateRule {
  name: string;
  /** Path of the page whose form is posted, e.g. /login or /i/happy-tails. */
  matches: (path: string) => boolean;
  limit: number;
  windowSeconds: number;
}

/** Only posts are counted: opening a page is free. */
export const RATE_RULES: RateRule[] = [
  // Sign in and create an account both post to /login. A kennel's staff may
  // share one connection at the start of a shift, so this is generous. The
  // code for two-step sign-in posts to /login/code and counts with them.
  { name: "sign-in", matches: (p) => p === "/login" || p.startsWith("/login/"), limit: 20, windowSeconds: 10 * 60 },
  // A parent sends the form once, perhaps again after fixing a mistake.
  { name: "intake", matches: (p) => p.startsWith("/i/"), limit: 10, windowSeconds: 10 * 60 },
  { name: "join", matches: (p) => p.startsWith("/join/"), limit: 20, windowSeconds: 10 * 60 },
];

export function rateRuleFor(path: string): RateRule | null {
  return RATE_RULES.find((r) => r.matches(path)) ?? null;
}

/** Set by the proxy on a request over its rate. Removed from every incoming request first. */
export const RATE_LIMITED_HEADER = "x-wagbook-rate-limited";

const MB = 1024 * 1024;

/**
 * The largest body a post to this path may have. Photos, certificates and
 * receipts go to signed-in pages and to the intake form (one certificate per
 * pet); the storage bucket's own limit is 10 MB a file. Everything else is
 * text.
 */
export function bodyLimitFor(path: string): number {
  if (path === "/app" || path.startsWith("/app/") || path.startsWith("/i/")) return 12 * MB;
  return 1 * MB;
}

/**
 * The visitor's address, as the host in front of the app reports it. Vercel
 * and the Caddy server in the self-hosting setup both overwrite these headers,
 * so a visitor cannot choose them. A server exposed with no proxy in front
 * would trust what the visitor sends; do not run it that way.
 */
export function clientAddress(headers: Headers): string {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "unknown";
}

/**
 * Counts hits per key in fixed windows. Memory is bounded: past `maxKeys`
 * the oldest windows are forgotten first (a forgotten key starts again at
 * zero, which only ever errs towards letting someone in).
 */
export class RateLimiter {
  private windows = new Map<string, { start: number; count: number }>();

  constructor(private readonly maxKeys = 10_000) {}

  /** Counts one hit. False when the key is over its limit for the current window. */
  hit(key: string, limit: number, windowMs: number, now: number): boolean {
    let w = this.windows.get(key);
    if (!w || now - w.start >= windowMs) {
      this.windows.delete(key);
      w = { start: now, count: 0 };
      this.windows.set(key, w);
      this.prune();
    }
    w.count += 1;
    return w.count <= limit;
  }

  get size(): number {
    return this.windows.size;
  }

  private prune() {
    // A Map keeps insertion order, and a key is re-inserted when its window
    // restarts, so the first entries are the oldest windows.
    for (const key of this.windows.keys()) {
      if (this.windows.size <= this.maxKeys) break;
      this.windows.delete(key);
    }
  }
}
