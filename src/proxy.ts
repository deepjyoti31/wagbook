import { NextResponse, type NextRequest } from "next/server";
import { contentSecurityPolicy, makeNonce } from "@/lib/csp";
import { scriptHashes } from "@/lib/csp-hashes";
import { bodyLimitFor, clientAddress, RATE_LIMITED_HEADER, RateLimiter, rateRuleFor } from "@/lib/rate-limit";
import { SUPABASE_URL } from "@/lib/supabase/env";
import { updateSession } from "@/lib/supabase/session";

// One per server process. See src/lib/rate-limit.ts for what that means.
const limiter = new RateLimiter();

// Next.js 16 calls this file "proxy" (it was "middleware" before).
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Only the proxy may say a request is over its rate.
  request.headers.delete(RATE_LIMITED_HEADER);
  if (request.method === "POST") {
    if (Number(request.headers.get("content-length") ?? 0) > bodyLimitFor(path)) {
      return new NextResponse("Too large.", { status: 413 });
    }
    const rule = rateRuleFor(path);
    if (rule && !limiter.hit(`${rule.name}:${clientAddress(request.headers)}`, rule.limit, rule.windowSeconds * 1000, Date.now())) {
      request.headers.set(RATE_LIMITED_HEADER, "1");
    }
  }

  // A fresh nonce for every request. Next.js reads it from the request's
  // Content-Security-Policy header and puts it on every script it writes.
  const csp = contentSecurityPolicy({
    nonce: makeNonce(),
    scriptHashes: process.env.NODE_ENV === "development" ? null : scriptHashes(),
    supabaseUrl: SUPABASE_URL,
    dev: process.env.NODE_ENV === "development",
  });
  request.headers.set("content-security-policy", csp);
  const response = await updateSession(request);
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Skip static files and images; run on everything else.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
