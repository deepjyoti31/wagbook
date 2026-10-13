import "server-only";
import { headers } from "next/headers";

/**
 * The public address of this Wagbook, e.g. https://book.happytails.in.
 * Used to build links that are sent to parents.
 *
 * Order of trust:
 *   1. NEXT_PUBLIC_SITE_URL, set by whoever deploys it.
 *   2. VERCEL_PROJECT_PRODUCTION_URL, set by Vercel itself.
 *   3. The request's Host header, in development only. In production a Host
 *      header is something the visitor's browser (or an attacker) chose, and a
 *      link built from it could send a parent to someone else's site.
 */
export async function siteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/+$/, "");

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;

  if (process.env.NODE_ENV === "production") {
    throw new Error("Set NEXT_PUBLIC_SITE_URL to the public address of this site. See docs/10-setup-and-deploy.md.");
  }
  const host = (await headers()).get("host") ?? "localhost:3000";
  return `http://${host}`;
}
