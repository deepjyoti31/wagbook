"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/auth";
import { ALERT_KINDS } from "@/lib/alerts";
import { friendlyError } from "@/lib/errors";
import type { FormState } from "@/lib/forms";
import { getAppI18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";

/** A browser's push address: https, and not absurdly long. The database checks again. */
function pushAddress(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 1000) return null;
  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

/** Which alerts this person wants (M61). Their own only; the policies refuse anyone else's. */
export async function saveAlertChoices(_state: FormState, form: FormData): Promise<FormState> {
  const { org, user } = await requireOrg();
  const t = await getAppI18n();
  const chosen = ALERT_KINDS.filter((k) => form.get(k) === "on");
  const supabase = await createClient();
  const cleared = await supabase.from("alert_choices").delete().eq("org_id", org.id).eq("user_id", user.id);
  if (cleared.error) return { error: friendlyError(cleared.error, t) };
  if (chosen.length > 0) {
    const { error } = await supabase.from("alert_choices").insert(chosen.map((kind) => ({ org_id: org.id, user_id: user.id, kind })));
    if (error) return { error: friendlyError(error, t) };
  }
  revalidatePath("/app/more/alerts");
  return { ok: t.m.alerts.saved };
}

/** This phone takes alerts now: keep its push address for this person at this kennel. */
export async function savePhone(endpoint: string): Promise<FormState> {
  const { org, user } = await requireOrg();
  const t = await getAppI18n();
  const address = pushAddress(endpoint);
  if (!address) return { error: t.m.alerts.failed };
  const supabase = await createClient();
  const { error } = await supabase
    .from("push_subscriptions")
    .upsert({ org_id: org.id, user_id: user.id, endpoint: address }, { onConflict: "org_id,endpoint", ignoreDuplicates: true });
  if (error) return { error: friendlyError(error, t) };
  // Someone who has not chosen yet gets every alert, as the page shows ticked.
  const chosen = await supabase.from("alert_choices").select("kind", { count: "exact", head: true }).eq("org_id", org.id).eq("user_id", user.id);
  if (!chosen.error && (chosen.count ?? 0) === 0) {
    await supabase.from("alert_choices").insert(ALERT_KINDS.map((kind) => ({ org_id: org.id, user_id: user.id, kind })));
  }
  revalidatePath("/app/more/alerts");
  return { ok: t.m.alerts.on };
}

/** This phone takes no more alerts from this person at this kennel. */
export async function removePhone(endpoint: string): Promise<FormState> {
  const { org, user } = await requireOrg();
  const t = await getAppI18n();
  const supabase = await createClient();
  const { error } = await supabase.from("push_subscriptions").delete().eq("org_id", org.id).eq("user_id", user.id).eq("endpoint", endpoint);
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app/more/alerts");
  return { ok: t.m.alerts.off };
}
