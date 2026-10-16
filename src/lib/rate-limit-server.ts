import "server-only";
import { headers } from "next/headers";
import { RATE_LIMITED_HEADER } from "./rate-limit";

/**
 * True when src/proxy.ts found this post over its rate (src/lib/rate-limit.ts).
 * The actions strangers can reach check it first and answer with a sentence.
 */
export async function isRateLimited(): Promise<boolean> {
  return (await headers()).get(RATE_LIMITED_HEADER) === "1";
}
