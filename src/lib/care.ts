import type { Enums } from "./supabase/database.types";

/** Words for the kinds of care, as staff read them. */
export const CARE_KIND_LABEL: Record<Enums<"care_kind">, string> = {
  meal: "Meal",
  medication: "Medicine",
  walk: "Walk",
  play: "Play",
  cleaning: "Cleaning",
  other: "Other",
};

/** Plural, for counts on Today: "Meals 42 of 60". */
export const CARE_KIND_PLURAL: Record<Enums<"care_kind">, string> = {
  meal: "Meals",
  medication: "Medicines",
  walk: "Walks",
  play: "Play",
  cleaning: "Cleaning",
  other: "Other care",
};

export const CARE_KINDS = ["meal", "medication", "walk", "play", "cleaning", "other"] as const satisfies readonly Enums<"care_kind">[];

/**
 * A starting point for a kennel's house routines: three meals and a clean.
 * The kennel changes the times and adds its own afterwards.
 */
export const STARTER_ROUTINES: { kind: Enums<"care_kind">; label: string; due_time: string }[] = [
  { kind: "meal", label: "Breakfast", due_time: "09:00" },
  { kind: "cleaning", label: "Clean kennel", due_time: "11:00" },
  { kind: "meal", label: "Lunch", due_time: "14:00" },
  { kind: "meal", label: "Dinner", due_time: "19:00" },
];

/** "09:00:00" from the database as "09:00". */
export function clockText(time: string | null): string {
  return time ? time.slice(0, 5) : "Any time";
}

/**
 * Least time between the end of a pet's play session and the start of its
 * next, so its sessions are spread over the day rather than back to back.
 */
export const PLAY_GAP_MINUTES = 120;
