import type { Enums } from "./supabase/database.types";
import type { Messages } from "@/messages";

// Words for the kinds of care are in the message files: m.labels.careKind and careKindPlural.
export const CARE_KINDS = ["meal", "medication", "walk", "play", "cleaning", "other"] as const satisfies readonly Enums<"care_kind">[];

/**
 * A starting point for a kennel's house routines: three meals and a clean,
 * named in the language of the person who adds them. The kennel changes the
 * times and adds its own afterwards.
 */
export function starterRoutines(m: Messages): { kind: Enums<"care_kind">; label: string; due_time: string }[] {
  const s = m.routines.starter;
  return [
    { kind: "meal", label: s.breakfast, due_time: "09:00" },
    { kind: "cleaning", label: s.cleanKennel, due_time: "11:00" },
    { kind: "meal", label: s.lunch, due_time: "14:00" },
    { kind: "meal", label: s.dinner, due_time: "19:00" },
  ];
}

/** "09:00:00" from the database as "09:00". */
export function clockText(m: Messages, time: string | null): string {
  return time ? time.slice(0, 5) : m.common.anyTime;
}

/** How long after its time a task still to do is called late on the care round. */
export const LATE_AFTER_MINUTES = 30;

/**
 * Whether a task due at `dueTime` ("09:00" or "09:00:00") is late at `now`
 * ("09:45", the kennel's own clock): more than half an hour past its time. A
 * task with no time is never late.
 */
export function isLate(dueTime: string | null, now: string): boolean {
  if (!dueTime) return false;
  const minutes = (clock: string) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));
  return minutes(now) - minutes(dueTime) > LATE_AFTER_MINUTES;
}

/**
 * Least time between the end of a pet's play session and the start of its
 * next, so its sessions are spread over the day rather than back to back.
 */
export const PLAY_GAP_MINUTES = 120;
