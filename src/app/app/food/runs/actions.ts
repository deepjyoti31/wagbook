"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { isISODate } from "@/lib/core";
import { friendlyError } from "@/lib/errors";
import { text, type FormState } from "@/lib/forms";
import { getAppI18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";

const Id = z.uuid();

/** Start a rider's run for a day and time. Any member; the database checks the rider works here (WB170). */
export async function startRun(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const e = t.m.runs.errors;
  const rider = Id.safeParse(form.get("riderId"));
  if (!rider.success) return { error: e.rider };
  const date = text(form, "date") ?? "";
  const slot = z.enum(["morning", "afternoon", "evening"]).safeParse(form.get("slot"));
  if (!isISODate(date) || !slot.success) return { error: t.m.errors.missing };
  const supabase = await createClient();
  const { error } = await supabase.from("delivery_runs").insert({ org_id: org.id, run_date: date, slot: slot.data, rider_id: rider.data });
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app/food", "layout");
  return { ok: t.m.runs.runStarted };
}

/** Put a delivery on a run, at the end, take it off, or move it up or down (WB171: a run of its own day and time). Any member. */
export async function arrangeStop(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const e = t.m.runs.errors;
  const delivery = Id.safeParse(form.get("deliveryId"));
  if (!delivery.success) return { error: e.notFound };
  const supabase = await createClient();
  const intent = form.get("intent");

  if (intent === "add") {
    const run = Id.safeParse(form.get("runId"));
    if (!run.success) return { error: e.run };
    const last = await supabase.from("deliveries").select("run_position").eq("org_id", org.id).eq("run_id", run.data).order("run_position", { ascending: false, nullsFirst: false }).limit(1);
    const { error } = await supabase
      .from("deliveries")
      .update({ run_id: run.data, run_position: (last.data?.[0]?.run_position ?? 0) + 1 })
      .eq("org_id", org.id)
      .eq("id", delivery.data);
    if (error) return { error: friendlyError(error, t) };
    revalidatePath("/app/food", "layout");
    return { ok: t.m.runs.added };
  }
  if (intent === "off") {
    const { error } = await supabase.from("deliveries").update({ run_id: null, run_position: null }).eq("org_id", org.id).eq("id", delivery.data);
    if (error) return { error: friendlyError(error, t) };
    revalidatePath("/app/food", "layout");
    return { ok: t.m.common.saved };
  }

  // Up or down: swap places with the stop before or after it.
  const me = await supabase.from("deliveries").select("id, run_id, run_position").eq("org_id", org.id).eq("id", delivery.data).maybeSingle();
  if (!me.data?.run_id) return { error: e.notFound };
  const stops = await supabase.from("deliveries").select("id, run_position").eq("org_id", org.id).eq("run_id", me.data.run_id).neq("status", "cancelled").order("run_position", { nullsFirst: false }).order("created_at");
  if (stops.error) return { error: friendlyError(stops.error, t) };
  const order = stops.data.map((s) => s.id);
  const at = order.indexOf(me.data.id);
  const to = intent === "up" ? at - 1 : at + 1;
  if (at < 0 || to < 0 || to >= order.length) return { ok: t.m.common.saved };
  [order[at], order[to]] = [order[to], order[at]];
  for (const [i, id] of order.entries()) {
    const { error } = await supabase.from("deliveries").update({ run_position: i + 1 }).eq("org_id", org.id).eq("id", id);
    if (error) return { error: friendlyError(error, t) };
  }
  revalidatePath("/app/food", "layout");
  return { ok: t.m.common.saved };
}
