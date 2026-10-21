"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { isISODate, parseKgToGrams, todayIn } from "@/lib/core";
import { friendlyError } from "@/lib/errors";
import { text, type FormState } from "@/lib/forms";
import { fill } from "@/lib/i18n";
import { getAppI18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";

const Id = z.uuid();

/** Record a batch of cooking; the database takes its ingredients out of stock in the same step (record_batch). Any member. */
export async function recordBatch(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const e = t.m.kitchen.errors;
  const version = Id.safeParse(form.get("versionId"));
  if (!version.success) return { error: e.recipe };
  // Up to a tonne: parseKgToGrams stops at 200 kg, which is plenty for one batch.
  const grams = parseKgToGrams(text(form, "kg") ?? "");
  if (grams === null || grams < 100) return { error: e.kg };
  const packsText = text(form, "packs") ?? "";
  if (!/^\d{1,5}$/.test(packsText)) return { error: e.packs };
  const cookedOn = text(form, "cookedOn") ?? todayIn(org.time_zone);
  const boardersOn = text(form, "boardersOn");
  if (!isISODate(cookedOn) || (boardersOn !== null && !isISODate(boardersOn))) return { error: e.date };
  const cookText = text(form, "cookId");
  const cook = cookText ? Id.safeParse(cookText) : null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_batch", {
    p_org: org.id,
    p_version: version.data,
    p_grams: grams,
    p_packs: Number(packsText),
    p_cooked_on: cookedOn,
    p_cook: cook?.success ? cook.data : undefined,
    p_boarders_on: boardersOn ?? undefined,
    p_note: text(form, "note")?.slice(0, 300) ?? undefined,
  });
  if (error) return { error: friendlyError(error, t) };
  const batch = await supabase.from("batches").select("number").eq("org_id", org.id).eq("id", data).single();
  revalidatePath("/app", "layout");
  return { ok: fill(t.m.kitchen.batchRecorded, { number: batch.data?.number ?? "" }) };
}

/** Tick a delivery packed, from a batch of its own recipe within its date (the database checks: WB160, WB161). Any member. */
export async function packDelivery(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const e = t.m.kitchen.errors;
  const delivery = Id.safeParse(form.get("deliveryId"));
  if (!delivery.success) return { error: e.delivery };
  const batchText = text(form, "batchId");
  const batch = batchText ? Id.safeParse(batchText) : null;
  const supabase = await createClient();
  const d = await supabase.from("deliveries").select("kind").eq("org_id", org.id).eq("id", delivery.data).maybeSingle();
  if (!d.data) return { error: e.delivery };
  // An item made to order (a cake) is packed without a batch.
  if (d.data.kind !== "item" && !batch?.success) return { error: e.batch };
  const { error } = await supabase
    .from("deliveries")
    .update({ status: "packed", batch_id: batch?.success ? batch.data : null, packed_at: new Date().toISOString() })
    .eq("org_id", org.id)
    .eq("id", delivery.data)
    .eq("status", "planned");
  if (error) return { error: friendlyError(error, t) };
  const number = batch?.success ? (await supabase.from("batches").select("number").eq("org_id", org.id).eq("id", batch.data).single()).data?.number : null;
  revalidatePath("/app", "layout");
  return { ok: fill(t.m.kitchen.packed, { number: number ?? "" }) };
}
