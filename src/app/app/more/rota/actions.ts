"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { clockTime, diffDays, eachDate, addDays, isISODate } from "@/lib/core";
import { friendlyError } from "@/lib/errors";
import { checked, text, type FormState } from "@/lib/forms";
import { fill, plural } from "@/lib/i18n";
import { getAppI18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";
import { workers } from "@/lib/team";

const Id = z.uuid();

/** Owners and managers plan the rota (M43); the policies refuse anyone else too. */
async function planner() {
  const ctx = await requireOrg();
  const t = await getAppI18n();
  return { ...ctx, t, refused: ctx.canManage ? null : { error: t.m.rota.errors.managersOnly } };
}

/** Put one person on one shift for each day from one day to another (up to 31). The database refuses a clash or a day of leave. */
export async function putOnRota(_state: FormState, form: FormData): Promise<FormState> {
  const { org, t, refused } = await planner();
  if (refused) return refused;
  const e = t.m.rota.errors;
  const person = Id.safeParse(form.get("userId"));
  if (!person.success) return { error: e.person };
  const shift = Id.safeParse(form.get("shiftId"));
  if (!shift.success) return { error: e.shift };
  const from = text(form, "from");
  const to = text(form, "to") ?? from;
  if (!isISODate(from) || !isISODate(to) || to < from || diffDays(from, to) > 30) return { error: e.dates };

  const rows = eachDate(from, addDays(to, 1)).map((day) => ({ org_id: org.id, shift_id: shift.data, user_id: person.data, work_date: day }));
  const supabase = await createClient();
  const { error } = await supabase.from("rota").insert(rows);
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app", "layout");
  return { ok: plural(t.language, rows.length, t.m.rota.put.done) };
}

/** Take one person off one shift on one day. Part of planning, so managers too (D48). */
export async function takeOffRota(_state: FormState, form: FormData): Promise<FormState> {
  const { org, t, refused } = await planner();
  if (refused) return refused;
  const id = Id.safeParse(form.get("rotaId"));
  if (!id.success) return { error: t.m.rota.errors.notFound };
  const supabase = await createClient();
  const { data, error } = await supabase.from("rota").delete().eq("org_id", org.id).eq("id", id.data).select("id");
  if (error) return { error: friendlyError(error, t) };
  if (data.length === 0) return { error: t.m.rota.errors.notFound };
  revalidatePath("/app", "layout");
  return {};
}

function shiftFields(form: FormData) {
  return { starts: clockTime(form.get("starts")), ends: clockTime(form.get("ends")) };
}

/** Add a shift with its hours. */
export async function addShift(_state: FormState, form: FormData): Promise<FormState> {
  const { org, t, refused } = await planner();
  if (refused) return refused;
  const e = t.m.rota.errors;
  const name = text(form, "name");
  if (!name || name.length > 40) return { error: e.name };
  const { starts, ends } = shiftFields(form);
  if (!starts || !ends || starts === ends) return { error: e.times };
  const supabase = await createClient();
  const last = await supabase.from("shifts").select("sort_order").eq("org_id", org.id).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { error } = await supabase.from("shifts").insert({ org_id: org.id, name, starts_at: starts, ends_at: ends, sort_order: (last.data?.sort_order ?? 0) + 1 });
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app/more/rota");
  return { ok: fill(t.m.rota.shifts.added, { shift: name }) };
}

/** The usual three shifts, in the planner's language, for a kennel that has none yet. */
export async function addUsualShifts(): Promise<FormState> {
  const { org, t, refused } = await planner();
  if (refused) return refused;
  const n = t.m.rota.shifts.usual;
  const supabase = await createClient();
  const { error } = await supabase.from("shifts").insert([
    { org_id: org.id, name: n.morning, starts_at: "07:00", ends_at: "15:00", sort_order: 1 },
    { org_id: org.id, name: n.evening, starts_at: "15:00", ends_at: "23:00", sort_order: 2 },
    { org_id: org.id, name: n.night, starts_at: "23:00", ends_at: "07:00", sort_order: 3 },
  ]);
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app/more/rota");
  // The button goes once there are shifts, and its sentence with it: say it on the page.
  redirect("/app/more/rota?done=shifts");
}

/** Change a shift's hours. The rota from today on follows (the database moves it, and refuses a clash). */
export async function changeShift(_state: FormState, form: FormData): Promise<FormState> {
  const { org, t, refused } = await planner();
  if (refused) return refused;
  const e = t.m.rota.errors;
  const id = Id.safeParse(form.get("shiftId"));
  if (!id.success) return { error: e.notFound };
  const { starts, ends } = shiftFields(form);
  if (!starts || !ends || starts === ends) return { error: e.times };
  const supabase = await createClient();
  const { data, error } = await supabase.from("shifts").update({ starts_at: starts, ends_at: ends }).eq("org_id", org.id).eq("id", id.data).select("name");
  if (error) return { error: friendlyError(error, t) };
  if (data.length === 0) return { error: e.notFound };
  revalidatePath("/app", "layout");
  return { ok: fill(t.m.rota.shifts.saved, { shift: data[0].name }) };
}

/** Take a shift off the list (its rota stays), or put it back. */
export async function setShiftActive(_state: FormState, form: FormData): Promise<FormState> {
  const { org, t, refused } = await planner();
  if (refused) return refused;
  const id = Id.safeParse(form.get("shiftId"));
  if (!id.success) return { error: t.m.rota.errors.notFound };
  const supabase = await createClient();
  const { data, error } = await supabase.from("shifts").update({ is_active: form.get("active") === "true" }).eq("org_id", org.id).eq("id", id.data).select("id");
  if (error) return { error: friendlyError(error, t) };
  if (data.length === 0) return { error: t.m.rota.errors.notFound };
  revalidatePath("/app/more/rota");
  return {};
}

/** Who lives on site: a tick for each person working here. */
export async function saveOnSite(_state: FormState, form: FormData): Promise<FormState> {
  const { org, t, refused } = await planner();
  if (refused) return refused;
  const supabase = await createClient();
  const people = await workers(supabase, org.id);
  for (const p of people) {
    const lives = checked(form, `site_${p.user_id}`);
    if (lives === p.lives_on_site) continue;
    const { error } = await supabase.from("memberships").update({ lives_on_site: lives }).eq("org_id", org.id).eq("user_id", p.user_id);
    if (error) return { error: friendlyError(error, t) };
  }
  revalidatePath("/app", "layout");
  return { ok: t.m.rota.onSite.saved };
}

const Weekday = z.coerce.number().int().min(1).max(7);

/**
 * A person's usual week (M60): one shift on each chosen weekday, which then
 * fills the rota four weeks ahead (fill_rota), and on, week after week. A
 * weekday they already have that shift on is left as it is.
 */
export async function addPattern(_state: FormState, form: FormData): Promise<FormState> {
  const { org, t, refused } = await planner();
  if (refused) return refused;
  const e = t.m.rota.errors;
  const person = Id.safeParse(form.get("userId"));
  if (!person.success) return { error: e.person };
  const shift = Id.safeParse(form.get("shiftId"));
  if (!shift.success) return { error: e.shift };
  const days = form.getAll("weekday").map((d) => Weekday.safeParse(d));
  if (days.length === 0 || days.some((d) => !d.success)) return { error: t.m.rota.pattern.errors.days };
  const supabase = await createClient();
  const { error } = await supabase
    .from("rota_patterns")
    .upsert(
      days.map((d) => ({ org_id: org.id, user_id: person.data, shift_id: shift.data, weekday: d.data! })),
      { onConflict: "org_id,user_id,shift_id,weekday", ignoreDuplicates: true },
    );
  if (error) return { error: friendlyError(error, t) };
  const filled = await supabase.rpc("fill_rota", { p_org: org.id });
  if (filled.error) return { error: friendlyError(filled.error, t) };
  revalidatePath("/app", "layout");
  return { ok: plural(t.language, filled.data, t.m.rota.pattern.added) };
}

/** Take one weekday of a person's usual week away: its days still to come leave the rota with it; the days worked stay. */
export async function removePattern(_state: FormState, form: FormData): Promise<FormState> {
  const { org, t, refused } = await planner();
  if (refused) return refused;
  const id = Id.safeParse(form.get("patternId"));
  if (!id.success) return { error: t.m.rota.errors.notFound };
  const supabase = await createClient();
  const { data, error } = await supabase.from("rota_patterns").delete().eq("org_id", org.id).eq("id", id.data).select("id");
  if (error) return { error: friendlyError(error, t) };
  if (data.length === 0) return { error: t.m.rota.errors.notFound };
  revalidatePath("/app", "layout");
  redirect("/app/more/rota?done=pattern");
}
