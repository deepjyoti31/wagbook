"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { PLAY_GAP_MINUTES } from "@/lib/care";
import { planPlaySessions, playMinutesOn, playWindows, todayIn, toClock, toMinutes } from "@/lib/core";
import { friendlyError } from "@/lib/errors";
import { text, type FormState } from "@/lib/forms";
import { peakPeriods, toPeak } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";

const Id = z.uuid();

/**
 * Plan today's solo play for every pet in house, fitted around any sessions
 * already on the timetable. Safe to press again: pets that already have their
 * sessions get no more, and new arrivals are fitted into what is left.
 */
export async function planToday(): Promise<FormState> {
  const { org } = await requireOrg();
  if (org.play_sessions_per_day === 0) return { error: "Play planning is off. Set sessions for each pet on Play yards under More." };
  const today = todayIn(org.time_zone);
  const supabase = await createClient();

  const [yards, inHouse, existing, peaks] = await Promise.all([
    supabase.from("play_yards").select("id").eq("org_id", org.id).eq("is_active", true).order("sort_order").order("name"),
    supabase
      .from("bookings")
      .select("id, pet_id, kennels(sort_order, name)")
      .eq("org_id", org.id)
      .eq("status", "checked_in")
      .lte("start_date", today)
      .limit(2000),
    supabase.from("play_sessions").select("pet_id, yard_id, starts_at, duration_minutes").eq("org_id", org.id).eq("session_date", today).neq("status", "skipped"),
    peakPeriods(supabase, org.id, today, today),
  ]);
  if (yards.error || inHouse.error || existing.error || peaks.error) return { error: "Could not load today's pets and yards. Try again." };
  if (yards.data.length === 0) return { error: "Add a play yard first, on Play yards under More." };
  if (inHouse.data.length === 0) return { error: "No pets are checked in." };

  // Pets in kennel order, so the plan walks along the row.
  const pets = [...inHouse.data].sort(
    (a, b) => (a.kennels?.sort_order ?? 1e9) - (b.kennels?.sort_order ?? 1e9) || (a.kennels?.name ?? "").localeCompare(b.kennels?.name ?? ""),
  );
  const bookingOf = new Map(pets.map((p) => [p.pet_id, p.id]));
  const minutes = playMinutesOn(today, org.play_session_minutes, (peaks.data ?? []).map(toPeak));

  let plan;
  try {
    plan = planPlaySessions({
      dogs: pets.map((p) => ({ id: p.pet_id })),
      yards: yards.data,
      windows: playWindows(org.play_day_start, org.play_day_end, org.play_break_start, org.play_break_end),
      sessionMinutes: minutes,
      sessionsPerDog: org.play_sessions_per_day,
      changeoverMinutes: org.play_changeover_minutes,
      minGapMinutes: PLAY_GAP_MINUTES,
      existing: existing.data.map((s) => ({
        dogId: s.pet_id,
        yardId: s.yard_id,
        start: s.starts_at.slice(0, 5),
        end: toClock(Math.min(toMinutes(s.starts_at.slice(0, 5)) + s.duration_minutes, 24 * 60 - 1)),
      })),
    });
  } catch {
    return { error: "The play hours do not work. Check them on Play yards under More." };
  }

  if (plan.sessions.length > 0) {
    const { error } = await supabase.from("play_sessions").insert(
      plan.sessions.map((s) => ({
        org_id: org.id,
        yard_id: s.yardId,
        booking_id: bookingOf.get(s.dogId)!,
        pet_id: s.dogId,
        session_date: today,
        starts_at: s.start,
        duration_minutes: minutes,
      })),
    );
    if (error) return { error: friendlyError(error) };
  }

  revalidatePath("/app", "layout");
  const short = plan.shortfall.length;
  if (plan.sessions.length === 0 && short === 0) return { ok: "Every pet in house already has its sessions today." };
  return {
    ok:
      `Planned ${plan.sessions.length} ${plan.sessions.length === 1 ? "session" : "sessions"} of ${minutes} minutes.` +
      (short > 0 ? ` ${short} ${short === 1 ? "pet does" : "pets do"} not fit today. Add a yard, open longer or shorten sessions.` : ""),
  };
}

async function setSession(form: FormData, to: "done" | "pending" | "skipped", from: ("pending" | "done" | "skipped")[]): Promise<FormState> {
  const { org } = await requireOrg();
  const id = Id.safeParse(form.get("sessionId"));
  if (!id.success) return { error: "That session could not be found." };
  const supabase = await createClient();
  const { error } = await supabase.from("play_sessions").update({ status: to, ...(to === "skipped" ? { note: text(form, "note") } : {}) }).eq("org_id", org.id).eq("id", id.data).in("status", from);
  if (error) return { error: friendlyError(error) };
  revalidatePath("/app", "layout");
  return {};
}

/** Safe to tap twice: the second tap finds nothing pending. */
export async function sessionDone(_state: FormState, form: FormData): Promise<FormState> {
  return setSession(form, "done", ["pending"]);
}

export async function sessionUndo(_state: FormState, form: FormData): Promise<FormState> {
  return setSession(form, "pending", ["done", "skipped"]);
}

/** Skipping frees the yard for that slot. */
export async function sessionSkip(_state: FormState, form: FormData): Promise<FormState> {
  return setSession(form, "skipped", ["pending"]);
}

/** Move a session to another time or yard. The database refuses a slot that is taken. */
export async function moveSession(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const id = Id.safeParse(form.get("sessionId"));
  const yard = Id.safeParse(form.get("yardId"));
  const start = text(form, "startsAt");
  if (!id.success || !yard.success) return { error: "That session could not be found." };
  if (!start || !/^([01]\d|2[0-3]):[0-5]\d$/.test(start)) return { error: "Enter a time like 10:40." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("play_sessions")
    .update({ starts_at: start, yard_id: yard.data })
    .eq("org_id", org.id)
    .eq("id", id.data)
    .eq("status", "pending")
    .select("id");
  if (error) return { error: friendlyError(error) };
  if (data.length === 0) return { error: "Only a session still to happen can be moved." };
  revalidatePath("/app", "layout");
  return { ok: `Moved to ${start}.` };
}

/** Clear today's sessions still to happen, to plan again from scratch. Owners and managers. */
export async function clearPlan(): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  if (!canManage) return { error: "Only an owner or manager can clear the plan. Skip sessions one by one instead." };
  const today = todayIn(org.time_zone);
  const supabase = await createClient();
  const { error } = await supabase.from("play_sessions").delete().eq("org_id", org.id).eq("session_date", today).eq("status", "pending");
  if (error) return { error: friendlyError(error) };
  revalidatePath("/app", "layout");
  return { ok: `Cleared the sessions still to happen today. Sessions already done stay. Plan again when ready.` };
}
