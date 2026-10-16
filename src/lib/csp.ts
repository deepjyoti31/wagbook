/**
 * The Content Security Policy sent with every page (roadmap M9).
 *
 * Scripts run only from files on this site, or inline when they carry the
 * nonce made for this one request. An injected <script> or an onclick
 * attribute in stored text is refused by the browser even if React's escaping
 * were ever bypassed. See docs/05-security-and-privacy.md, "Browser protections".
 *
 * Why not 'strict-dynamic': with cache components, a page's shell is
 * prerendered at build time, when there is no request and so no nonce. Its
 * <script src> tags carry none, and 'strict-dynamic' would refuse them. Files
 * from this site ('self') are safe to allow: nothing a visitor sends is ever
 * served from this origin as a script (uploads go to Supabase Storage).
 *
 * The same shell holds two small inline scripts that cannot carry a nonce:
 * React's timing line (SHELL_TIME_SCRIPT) and Turbopack's chunk list for the
 * page. Both are fixed at build time, so they are allowed by their SHA-256
 * hashes (inlineScriptHashes), worked out from the build's own manifest.
 *
 * Styles allow inline: React writes style attributes, which a nonce cannot
 * cover, and a stylesheet cannot run code.
 */
export interface CspOptions {
  /** Fresh for every request. Base64, at least 128 random bits. */
  nonce: string;
  /**
   * 'sha256-...' sources for the shell's inline scripts. Null when they could
   * not be worked out: the policy then leaves scripts unrestricted rather than
   * break every page, as before M9.
   */
  scriptHashes: string[] | null;
  /** The Supabase project URL. Photos are shown from signed Storage links on it (img-src only). */
  supabaseUrl: string;
  /** `next dev` needs eval for its error overlay. Never in production. */
  dev: boolean;
}

export function contentSecurityPolicy({ nonce, scriptHashes, supabaseUrl, dev }: CspOptions): string {
  let supabase = "";
  try {
    supabase = supabaseUrl ? new URL(supabaseUrl).origin : "";
  } catch {
    supabase = "";
  }
  const directives: [string, ...string[]][] = [
    // Without a script-src, default-src would govern scripts and refuse the shell's inline ones.
    ["default-src", "'self'"],
    ...(scriptHashes
      ? ([["script-src", "'self'", `'nonce-${nonce}'`, ...scriptHashes, ...(dev ? ["'unsafe-eval'"] : [])]] as [string, ...string[]][])
      : []),
    ["style-src", "'self'", "'unsafe-inline'"],
    ["img-src", "'self'", "blob:", "data:", ...(supabase ? [supabase] : [])],
    ["font-src", "'self'"],
    // The browser never talks to Supabase itself: every request goes through this site.
    ["connect-src", "'self'", ...(dev ? ["ws:"] : [])],
    ["worker-src", "'self'"],
    ["manifest-src", "'self'"],
    ["frame-src", "'none'"],
    ["object-src", "'none'"],
    ["base-uri", "'self'"],
    ["form-action", "'self'"],
    ["frame-ancestors", "'none'"],
  ];
  return directives.map((d) => d.join(" ")).join("; ");
}

/** A nonce: 128 random bits from the platform's cryptographic generator, in base64. */
export function makeNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

/**
 * React writes this line into every prerendered shell, without a nonce. It is
 * a constant of react-dom; a test fails if an upgrade changes it.
 */
export const SHELL_TIME_SCRIPT = "requestAnimationFrame(function(){$RT=performance.now()});";

/** What Next.js keeps in .next/build-manifest.json that matters here. */
export interface BuildManifest {
  pagesChunkGroupBootstrapParams?: Record<string, unknown>;
  chunkLoadingGlobal?: string;
}

/**
 * The inline scripts a prerendered shell may contain, as the exact text
 * Next.js writes: React's timing line, and for each page Turbopack's
 * `(globalThis[...] || (globalThis[...] = [])).push({...});` (the same
 * expression as getTurbopackChunkGroupBootstrap in Next.js). The hashes of
 * these, and nothing else, are allowed.
 */
export function shellInlineScripts(manifest: BuildManifest): string[] {
  const scripts = [SHELL_TIME_SCRIPT];
  const params = manifest.pagesChunkGroupBootstrapParams;
  if (params && manifest.chunkLoadingGlobal) {
    const g = JSON.stringify(manifest.chunkLoadingGlobal);
    for (const value of Object.values(params)) {
      if (value) scripts.push(`(globalThis[${g}] || (globalThis[${g}] = [])).push(${JSON.stringify(value)});`);
    }
  }
  return scripts;
}
