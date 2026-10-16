import type { NextConfig } from "next";

/**
 * Sent with every response. See docs/05-security-and-privacy.md, "Browser protections".
 * The Content-Security-Policy is not here: it carries a fresh nonce for every
 * request, so src/proxy.ts sets it (src/lib/csp.ts).
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  // A self-contained server for the Docker image (Dockerfile sets this). Left
  // off otherwise, so `next start` and Vercel behave as usual.
  output: process.env.WAGBOOK_STANDALONE ? "standalone" : undefined,
  partialPrefetching: true,
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // Photos and certificates are sent to Server Actions. The browser shrinks
      // photos first (a few hundred kilobytes each), but a phone without
      // JavaScript sends them as taken, and a certificate PDF may be large.
      // The storage bucket's own limit is 10 MB a file.
      bodySizeLimit: "12mb",
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
