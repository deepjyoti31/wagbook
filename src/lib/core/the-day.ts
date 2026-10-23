/**
 * The day, smoother (Phase 6, M50 to M57, D52): which house jobs fall on a
 * day, the stay report worked out from a stay's records, whether a pet's
 * passing can still be undone, and a parent's supplies in words.
 */
import { chargeableUnits, type BookingKind } from "./stay";
import type { ISODate } from "./dates";
import { isoWeekday } from "./food";

export interface HouseJob {
  weekday: number | null;
  is_active: boolean;
}

/** The house jobs that fall on a day (M51): active, and every day or on that weekday. */
export function houseJobsOn<J extends HouseJob>(jobs: readonly J[], date: ISODate): J[] {
  const weekday = isoWeekday(date);
  return jobs.filter((j) => j.is_active && (j.weekday === null || j.weekday === weekday));
}

/** A pet's passing is undone or changed within a week of marking it (M52, the database's WB253). */
export const PASSING_UNDO_DAYS = 7;

export function canUndoPassing(markedAt: string | null, now: Date = new Date()): boolean {
  if (!markedAt) return false;
  return now.getTime() - new Date(markedAt).getTime() <= PASSING_UNDO_DAYS * 24 * 60 * 60 * 1000;
}

export interface StayRecords {
  kind: BookingKind;
  startDate: ISODate;
  endDate: ISODate;
  /** The stay's meal and medicine tasks. */
  tasks: readonly { kind: string; label: string; status: string }[];
  /** Play sessions done. */
  play: number;
  /** Weighings from a month before the stay to its end, oldest first. */
  weights: readonly { on: ISODate; grams: number }[];
  /** Incidents the parent was told of. */
  incidents: readonly { on: ISODate; category: string }[];
}

export interface StayReport {
  /** Nights for boarding, days for day boarding. */
  units: number;
  /** Meals eaten (done) of those offered (done or skipped); a meal never reached is left out. */
  meals: { eaten: number; offered: number };
  /** Each medicine by its label: doses given of those due. */
  medicines: { label: string; given: number; due: number }[];
  play: number;
  /** The weight coming in (the last weighing up to the first day) and going out (the last one after it, during the stay). */
  weightIn: number | null;
  weightOut: number | null;
  /** How many incidents of each kind, in the order they happened. */
  incidents: { category: string; count: number }[];
}

/**
 * The stay report (M53), worked out from what is already recorded: nothing is
 * typed twice. A task still pending was never offered, so it does not count.
 */
export function stayReport(r: StayRecords): StayReport {
  const offered = r.tasks.filter((t) => t.status !== "pending");
  const meals = offered.filter((t) => t.kind === "meal");
  const medicines: StayReport["medicines"] = [];
  for (const t of offered.filter((x) => x.kind === "medication")) {
    let row = medicines.find((x) => x.label === t.label);
    if (!row) medicines.push((row = { label: t.label, given: 0, due: 0 }));
    row.due += 1;
    if (t.status === "done") row.given += 1;
  }
  const before = r.weights.filter((w) => w.on <= r.startDate);
  const during = r.weights.filter((w) => w.on > r.startDate && w.on <= r.endDate);
  const weightIn = before.at(-1)?.grams ?? during[0]?.grams ?? null;
  const outRow = before.length > 0 ? during.at(-1) : during.length > 1 ? during.at(-1) : undefined;
  const incidents: StayReport["incidents"] = [];
  for (const i of r.incidents) {
    const row = incidents.find((x) => x.category === i.category);
    if (row) row.count += 1;
    else incidents.push({ category: i.category, count: 1 });
  }
  return {
    units: chargeableUnits(r.kind, r.startDate, r.endDate),
    meals: { eaten: meals.filter((t) => t.status === "done").length, offered: meals.length },
    medicines,
    play: r.play,
    weightIn,
    weightOut: outRow?.grams ?? null,
    incidents,
  };
}

/** A supply's amount for reading: grams as kilos past a kilo ("1.2 kg", "800 g"), doses as a number. */
export function supplyAmount(kind: "food" | "medicine", amount: number, words: { grams: string; kilos: string; doses: string }, locale = "en-IN"): string {
  if (kind === "medicine") return words.doses.replace("{n}", String(amount));
  if (amount >= 1000) return words.kilos.replace("{kg}", new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(amount / 1000));
  return words.grams.replace("{g}", String(amount));
}
