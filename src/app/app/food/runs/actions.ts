"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** A run's stops in order, deliveries and the pick-ups and drops of boarders (M39) together, as my_runs() orders them. */
async function runStops(supabase: Supabase, orgId: string, runId: string) {
  const [deliveries, trips] = await Promise.all([
    supabase.from("deliveries").select("id, run_position, created_at").eq("org_id", orgId).eq("run_id", runId).neq("status", "cancelled"),
    supabase.from("trips").select("id, run_position, created_at").eq("org_id", orgId).eq("run_id", runId).neq("status", "cancelled"),
  ]);
  if (deliveries.error || trips.error) return null;
  return [...deliveries.data.map((d) => ({ ...d, trip: false })), ...trips.data.map((x) => ({ ...x, trip: true }))].sort(
    (a, b) => (a.run_position ?? Infinity) - (b.run_position ?? Infinity) || a.created_at.localeCompare(b.created_at),
  );
}

/** Put a stop on a run, at the end, take it off, or move it up or down (WB171: a run of its own day and time). Any member. A stop is a delivery or a trip. */
export async function arrangeStop(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const e = t.m.runs.errors;
  const delivery = Id.safeParse(form.get("deliveryId"));
  const tripId = Id.safeParse(form.get("tripId"));
  const isTrip = tripId.success;
  const stopId = isTrip ? tripId.data : delivery.success ? delivery.data : null;
  if (!stopId) return { error: e.notFound };
  const supabase = await createClient();
  const intent = form.get("intent");
  const place = (run_id: string | null, run_position: number | null) =>
    isTrip
      ? supabase.from("trips").update({ run_id, run_position }).eq("org_id", org.id).eq("id", stopId).select("day:trip_date")
      : supabase.from("deliveries").update({ run_id, run_position }).eq("org_id", org.id).eq("id", stopId).select("day:delivery_date");

  if (intent === "add") {
    const run = Id.safeParse(form.get("runId"));
    if (!run.success) return { error: e.run };
    const stops = await runStops(supabase, org.id, run.data);
    const last = Math.max(0, ...(stops ?? []).map((x) => x.run_position ?? 0));
    const { data, error } = await place(run.data, last + 1);
    if (error) return { error: friendlyError(error, t) };
    if (data.length === 0) return { error: e.notFound };
    revalidatePath("/app/food", "layout");
    // The stop's form moves to the run once it is on it, so the sentence is shown by the page instead.
    redirect(`/app/food/runs?date=${data[0].day}&done=added`);
  }
  if (intent === "off") {
    const { error } = await place(null, null);
    if (error) return { error: friendlyError(error, t) };
    revalidatePath("/app/food", "layout");
    return { ok: t.m.common.saved };
  }

  // Up or down: swap places with the stop before or after it.
  const me = isTrip
    ? await supabase.from("trips").select("run_id").eq("org_id", org.id).eq("id", stopId).maybeSingle()
    : await supabase.from("deliveries").select("run_id").eq("org_id", org.id).eq("id", stopId).maybeSingle();
  if (!me.data?.run_id) return { error: e.notFound };
  const stops = await runStops(supabase, org.id, me.data.run_id);
  if (!stops) return { error: t.m.errors.missing };
  const at = stops.findIndex((x) => x.id === stopId && x.trip === isTrip);
  const to = intent === "up" ? at - 1 : at + 1;
  if (at < 0 || to < 0 || to >= stops.length) return { ok: t.m.common.saved };
  [stops[at], stops[to]] = [stops[to], stops[at]];
  for (const [i, x] of stops.entries()) {
    const { error } = x.trip
      ? await supabase.from("trips").update({ run_position: i + 1 }).eq("org_id", org.id).eq("id", x.id)
      : await supabase.from("deliveries").update({ run_position: i + 1 }).eq("org_id", org.id).eq("id", x.id);
    if (error) return { error: friendlyError(error, t) };
  }
  revalidatePath("/app/food", "layout");
  return { ok: t.m.common.saved };
}
