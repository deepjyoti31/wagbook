"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { PLAY_GAP_MINUTES } from "@/lib/care";
import { planPlaySessions, playMinutesOn, playWindows, todayIn, toClock, toMinutes } from "@/lib/core";
import { friendlyError } from "@/lib/errors";
import { fill, plural } from "@/lib/i18n";
import { getAppI18n } from "@/lib/i18n-server";
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
  const t = await getAppI18n();
  const { m, language } = t;
  if (org.play_sessions_per_day === 0) return { error: m.play.planningOff };
  const today = todayIn(org.time_zone);
  const supabase = await createClient();

  const [yards, inHouse, existing, peaks] = await Promise.all([
    supabase.from("play_yards").select("id").eq("org_id", org.id).eq("is_active", true).order("sort_order").order("name"),
    supabase
      .from("bookings")
      .select("id, pet_id, client_id, kennel_id, kennels(sort_order, name)")
      .eq("org_id", org.id)
      .eq("status", "checked_in")
      .lte("start_date", today)
      .limit(2000),
    supabase.from("play_sessions").select("pet_id, yard_id, starts_at, duration_minutes").eq("org_id", org.id).eq("session_date", today).neq("status", "skipped"),
    peakPeriods(supabase, org.id, today, today),
  ]);
  if (yards.error || inHouse.error || existing.error || peaks.error) return { error: m.play.couldNotLoad };
  if (yards.data.length === 0) return { error: m.play.addYardFirst };
  if (inHouse.data.length === 0) return { error: m.today.noneInHouse };

  // Pets in kennel order, so the plan walks along the row.
  const pets = [...inHouse.data].sort(
    (a, b) => (a.kennels?.sort_order ?? 1e9) - (b.kennels?.sort_order ?? 1e9) || (a.kennels?.name ?? "").localeCompare(b.kennels?.name ?? ""),
  );
  const bookingOf = new Map(pets.map((p) => [p.pet_id, p]));
  // Two pets in one kennel are siblings (the database allows nothing else), and siblings play together.
  const inKennel = new Map<string, number>();
  for (const p of pets) if (p.kennel_id) inKennel.set(p.kennel_id, (inKennel.get(p.kennel_id) ?? 0) + 1);
  const minutes = playMinutesOn(today, org.play_session_minutes, (peaks.data ?? []).map(toPeak));

  let plan;
  try {
    plan = planPlaySessions({
      dogs: pets.map((p) => ({ id: p.pet_id, together: p.kennel_id && inKennel.get(p.kennel_id)! > 1 ? p.kennel_id : null })),
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
    return { error: m.play.hoursDoNotWork };
  }

  if (plan.sessions.length > 0) {
    const { error } = await supabase.from("play_sessions").insert(
      plan.sessions.map((s) => ({
        org_id: org.id,
        yard_id: s.yardId,
        booking_id: bookingOf.get(s.dogId)!.id,
        pet_id: s.dogId,
        // The database copies it from the booking whatever is sent.
        client_id: bookingOf.get(s.dogId)!.client_id,
        session_date: today,
        starts_at: s.start,
        duration_minutes: minutes,
      })),
    );
    if (error) return { error: friendlyError(error, t) };
  }

  revalidatePath("/app", "layout");
  const short = plan.shortfall.length;
  if (plan.sessions.length === 0 && short === 0) return { ok: m.play.allHaveSessions };
  const planned = plural(language, plan.sessions.length, m.play.planned, { minutes });
  return { ok: short > 0 ? `${planned} ${plural(language, short, m.play.doNotFit)}` : planned };
}

async function setSession(form: FormData, to: "done" | "pending" | "skipped", from: ("pending" | "done" | "skipped")[]): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const id = Id.safeParse(form.get("sessionId"));
  if (!id.success) return { error: t.m.play.sessionNotFound };
  const supabase = await createClient();
  const { error } = await supabase.from("play_sessions").update({ status: to, ...(to === "skipped" ? { note: text(form, "note") } : {}) }).eq("org_id", org.id).eq("id", id.data).in("status", from);
  if (error) return { error: friendlyError(error, t) };
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
  const t = await getAppI18n();
  const id = Id.safeParse(form.get("sessionId"));
  const yard = Id.safeParse(form.get("yardId"));
  const start = text(form, "startsAt");
  if (!id.success || !yard.success) return { error: t.m.play.sessionNotFound };
  if (!start || !/^([01]\d|2[0-3]):[0-5]\d$/.test(start)) return { error: t.m.play.timeLike };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("play_sessions")
    .update({ starts_at: start, yard_id: yard.data })
    .eq("org_id", org.id)
    .eq("id", id.data)
    .eq("status", "pending")
    .select("id");
  if (error) return { error: friendlyError(error, t) };
  if (data.length === 0) return { error: t.m.play.onlyPendingMove };
  revalidatePath("/app", "layout");
  return { ok: fill(t.m.play.moved, { time: start }) };
}

/** Clear today's sessions still to happen, to plan again from scratch. Owners and managers. */
export async function clearPlan(): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  if (!canManage) return { error: t.m.play.clearOnlyManagers };
  const today = todayIn(org.time_zone);
  const supabase = await createClient();
  const { error } = await supabase.from("play_sessions").delete().eq("org_id", org.id).eq("session_date", today).eq("status", "pending");
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app", "layout");
  return { ok: t.m.play.cleared };
}
