import "server-only";
import { after } from "next/server";
import { isSupabaseConfigured } from "./supabase/env";
import { createAnonClient } from "./supabase/server";
import { vapidHeaders, vapidKeyObjects, type VapidKeys } from "./vapid";

/**
 * Alerts on staff phones (M61, D53). The database writes each alert and the
 * phones it should wake; right after anything that may raise one, the app
 * takes those phones (take_pushes, with the installation's PUSH_SECRET) and
 * sends each an empty push signed with its VAPID key. The phone then asks
 * Wagbook, signed in, what happened (/api/alerts). Switched off until all
 * four settings are given (docs/10-setup-and-deploy.md, "Alerts on phones").
 */

interface PushConfig extends VapidKeys {
  secret: string;
}

function pushConfig(): PushConfig | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY ?? "";
  const privateKey = process.env.VAPID_PRIVATE_KEY ?? "";
  const subject = process.env.VAPID_SUBJECT ?? "";
  const secret = process.env.PUSH_SECRET ?? "";
  if (!publicKey || !privateKey || !/^(mailto:|https:\/\/)/.test(subject) || secret.length < 32) return null;
  if (!vapidKeyObjects({ publicKey, privateKey })) return null;
  return { publicKey, privateKey, subject, secret };
}

/** The public key a phone subscribes with, or null when alerts are not set up on this installation. */
export function vapidPublicKey(): string | null {
  return pushConfig()?.publicKey ?? null;
}

/** Send one empty push. Returns "gone" when the push service says the phone no longer takes them. */
async function wake(endpoint: string, config: PushConfig): Promise<"sent" | "gone" | "failed"> {
  const headers = vapidHeaders(endpoint, config);
  if (!headers) return "gone";
  try {
    const res = await fetch(endpoint, { method: "POST", headers, signal: AbortSignal.timeout(5000) });
    if (res.status === 404 || res.status === 410) return "gone";
    return res.ok ? "sent" : "failed";
  } catch {
    return "failed";
  }
}

/** Wake every phone with an alert waiting, at most a few rounds. Never throws: an alert that fails waits for the next. */
export async function sendPendingPushes(): Promise<void> {
  const config = pushConfig();
  if (!config || !isSupabaseConfigured()) return;
  const anon = createAnonClient();
  let gone: string[] = [];
  for (let round = 0; round < 3; round++) {
    const { data, error } = await anon.rpc("take_pushes", { p_secret: config.secret, p_gone: gone.length > 0 ? gone : undefined });
    if (error) {
      console.error("Alerts could not be taken:", error.message);
      return;
    }
    gone = [];
    if (!data || data.length === 0) return;
    const results = await Promise.all(data.map(async (row) => [row.endpoint, await wake(row.endpoint, config)] as const));
    gone = results.filter(([, r]) => r === "gone").map(([e]) => e);
    if (gone.length === 0) return;
  }
}

/** After the response is sent, wake the phones for whatever the request just raised. */
export function sendAlertsAfter(): void {
  after(sendPendingPushes);
}
