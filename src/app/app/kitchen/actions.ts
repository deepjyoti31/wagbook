"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { isISODate, parseKgToGrams, todayIn } from "@/lib/core";
import { friendlyError } from "@/lib/errors";
import { text, type FormState } from "@/lib/forms";
import { fill, plural } from "@/lib/i18n";
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

/**
 * Pack every delivery of a day still to pack, in one tap (M54): each from the
 * newest batch of its own recipe in date, as the page offers one at a time; an
 * item made to order without a batch. One with no batch in date is left to
 * pack by hand. The database checks each (WB160, WB161). Any member.
 */
export async function packAll(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const w = t.m.packAll;
  const day = text(form, "date");
  if (!day || !isISODate(day)) return { error: t.m.kitchen.errors.delivery };
  const supabase = await createClient();
  const [deliveries, batches] = await Promise.all([
    supabase.from("deliveries").select("id, kind, recipe_id").eq("org_id", org.id).eq("delivery_date", day).eq("status", "planned").limit(1000),
    supabase.from("batches").select("id, recipe_id").eq("org_id", org.id).lte("cooked_on", day).gte("use_by", day).order("cooked_on", { ascending: false }).order("number", { ascending: false }),
  ]);
  if (deliveries.error || batches.error) return { error: friendlyError(deliveries.error ?? batches.error, t) };
  if (deliveries.data.length === 0) return { error: w.nothing };
  let packed = 0;
  let skipped = 0;
  for (const d of deliveries.data) {
    const batch = d.kind === "item" ? null : batches.data.find((b) => b.recipe_id === d.recipe_id);
    if (d.kind !== "item" && !batch) {
      skipped += 1;
      continue;
    }
    const { data, error } = await supabase
      .from("deliveries")
      .update({ status: "packed", batch_id: batch?.id ?? null, packed_at: new Date().toISOString() })
      .eq("org_id", org.id)
      .eq("id", d.id)
      .eq("status", "planned")
      .select("id");
    if (error) return { error: friendlyError(error, t) };
    packed += data.length;
  }
  revalidatePath("/app", "layout");
  const said = plural(t.language, packed, w.done);
  return skipped > 0 ? { ok: `${said} ${plural(t.language, skipped, w.skipped)}` } : { ok: said };
}
