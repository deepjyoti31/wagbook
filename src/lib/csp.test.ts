import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, makeNonce, SHELL_TIME_SCRIPT, shellInlineScripts } from "./csp";

const require = createRequire(import.meta.url);
const base = { nonce: "abc123==", supabaseUrl: "https://xyz.supabase.co/", dev: false };

function directive(policy: string, name: string): string[] | undefined {
  const found = policy.split("; ").find((d) => d.split(" ")[0] === name);
  return found?.split(" ").slice(1);
}

describe("contentSecurityPolicy", () => {
  it("lets scripts run only from this site, with this request's nonce, or by hash", () => {
    const p = contentSecurityPolicy({ ...base, scriptHashes: ["'sha256-AAA='"] });
    expect(directive(p, "script-src")).toEqual(["'self'", "'nonce-abc123=='", "'sha256-AAA='"]);
    expect(p).not.toContain("unsafe-eval");
    expect(p).not.toContain("strict-dynamic");
    expect(directive(p, "script-src")).not.toContain("'unsafe-inline'");
  });

  it("keeps the protections that were there before M9", () => {
    const p = contentSecurityPolicy({ ...base, scriptHashes: [] });
    expect(directive(p, "frame-ancestors")).toEqual(["'none'"]);
    expect(directive(p, "object-src")).toEqual(["'none'"]);
    expect(directive(p, "base-uri")).toEqual(["'self'"]);
    expect(directive(p, "form-action")).toEqual(["'self'"]);
  });

  it("allows photos from the Supabase project, by origin only, and requests only to this site", () => {
    const p = contentSecurityPolicy({ ...base, scriptHashes: [] });
    expect(directive(p, "img-src")).toContain("https://xyz.supabase.co");
    expect(directive(p, "connect-src")).toEqual(["'self'"]);
  });

  it("survives a missing or malformed Supabase address", () => {
    expect(directive(contentSecurityPolicy({ ...base, scriptHashes: [], supabaseUrl: "" }), "img-src")).toEqual(["'self'", "blob:", "data:"]);
    expect(directive(contentSecurityPolicy({ ...base, scriptHashes: [], supabaseUrl: "not a url" }), "img-src")).toEqual(["'self'", "blob:", "data:"]);
  });

  it("adds eval only for next dev", () => {
    expect(directive(contentSecurityPolicy({ ...base, scriptHashes: [], dev: true }), "script-src")).toContain("'unsafe-eval'");
  });

  it("lets inline scripts run, rather than break pages, when the hashes are unknown", () => {
    // With no script-src at all, default-src 'self' would refuse every inline script.
    const p = contentSecurityPolicy({ ...base, scriptHashes: null });
    expect(directive(p, "script-src")).toEqual(["'self'", "'unsafe-inline'"]);
    expect(p).not.toContain("nonce-");
    expect(directive(contentSecurityPolicy({ ...base, scriptHashes: null, dev: true }), "script-src")).toEqual(["'self'", "'unsafe-inline'", "'unsafe-eval'"]);
  });
});

describe("makeNonce", () => {
  it("is 128 random bits in base64, different every time", () => {
    const a = makeNonce();
    expect(atob(a)).toHaveLength(16);
    expect(new Set(Array.from({ length: 50 }, makeNonce)).size).toBe(50);
  });
});

describe("shellInlineScripts", () => {
  it("is React's timing line plus Turbopack's chunk list for each page, as Next.js writes them", () => {
    const scripts = shellInlineScripts({
      chunkLoadingGlobal: "TURBOPACK",
      pagesChunkGroupBootstrapParams: { "/page": { otherChunks: ["static/chunks/a.js"], runtimeModuleIds: [1] } },
    });
    expect(scripts).toEqual([
      SHELL_TIME_SCRIPT,
      '(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push({"otherChunks":["static/chunks/a.js"],"runtimeModuleIds":[1]});',
    ]);
  });

  it("is only the timing line for a build without Turbopack's list", () => {
    expect(shellInlineScripts({})).toEqual([SHELL_TIME_SCRIPT]);
  });

  it("matches the line in the react-dom that Next.js renders with (fails if an upgrade changes it)", () => {
    // The App Router uses the copy of React that ships inside Next.js.
    const file = join(dirname(require.resolve("next/package.json")), "dist/compiled/react-dom/cjs/react-dom-server.node.production.js");
    expect(readFileSync(file, "utf8")).toContain(JSON.stringify(SHELL_TIME_SCRIPT));
  });

  it("matches how the installed Next.js writes the chunk list (fails if an upgrade changes it)", () => {
    const file = require.resolve("next/dist/server/get-page-files.js");
    expect(readFileSync(file, "utf8")).toContain("`(globalThis[${g}] || (globalThis[${g}] = [])).push(${JSON.stringify(params)});`");
  });
});
