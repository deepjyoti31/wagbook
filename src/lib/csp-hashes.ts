import "server-only";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { shellInlineScripts, type BuildManifest } from "./csp";

let cached: string[] | null | undefined;

/**
 * The 'sha256-...' sources for the inline scripts in this build's prerendered
 * shells (see shellInlineScripts). Read once from .next/build-manifest.json.
 * Null when that file cannot be read, and the reason is logged once: the
 * Content-Security-Policy then has no script-src, which is weaker but keeps
 * every page working. `npm run test:e2e` checks that it is read.
 */
export function scriptHashes(): string[] | null {
  if (cached !== undefined) return cached;
  try {
    const manifest = JSON.parse(readFileSync(join(process.cwd(), ".next", "build-manifest.json"), "utf8")) as BuildManifest;
    const hashes = shellInlineScripts(manifest).map((s) => `'sha256-${createHash("sha256").update(s).digest("base64")}'`);
    cached = [...new Set(hashes)];
  } catch (error) {
    // `next dev` builds pages as they are asked for, so its manifest is not final.
    if (process.env.NODE_ENV === "production") {
      console.error("Content-Security-Policy: could not read .next/build-manifest.json, so inline scripts are allowed without a nonce.", error);
    }
    cached = null;
  }
  return cached;
}
