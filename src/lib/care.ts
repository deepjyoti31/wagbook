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

/**
 * Least time between the end of a pet's play session and the start of its
 * next, so its sessions are spread over the day rather than back to back.
 */
export const PLAY_GAP_MINUTES = 120;
