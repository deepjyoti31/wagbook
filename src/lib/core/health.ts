import { addDays, type ISODate } from "./dates";

/**
 * Health papers at the door (M40, D47): what a pet lacks on a day by the
 * kennel's rules. Must match pet_health_problems() in the database, which
 * refuses check-in while the kennel says so.
 */

export type HealthProblem = { problem: "vaccine"; vaccine: string } | { problem: "deworming" | "ticks" | "neutering" };

export interface HealthRules {
  required: readonly { vaccine: string; months_valid: number }[];
  deworm_days: number | null;
  tick_days: number | null;
  neuter_months: number | null;
}

export interface HealthPet {
  date_of_birth: ISODate | null;
  is_neutered: boolean | null;
  dewormed_on: ISODate | null;
  tick_treated_on: ISODate | null;
  vaccinations: readonly { vaccine: string; given_on: ISODate | null; valid_until: ISODate | null }[];
}

/** A vaccine's name for matching: lower case, letters and digits only ("Kennel cough" is "kennel_cough"). */
export const vaccineKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

/** The date a number of months after another, as Postgres adds months (the last day of a shorter month). */
export function addMonths(date: ISODate, months: number): ISODate {
  const [y, m, d] = date.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/** What the pet lacks on `on`: each required vaccine with no record or lapsed, deworming, tick treatment, neutering. */
export function healthProblems(pet: HealthPet, rules: HealthRules, on: ISODate): HealthProblem[] {
  const out: HealthProblem[] = [];
  for (const r of rules.required) {
    const ok = pet.vaccinations.some((v) => {
      if (vaccineKey(v.vaccine) !== vaccineKey(r.vaccine)) return false;
      const until = v.valid_until ?? (v.given_on ? addDays(addMonths(v.given_on, r.months_valid), -1) : null);
      return until !== null && until >= on;
    });
    if (!ok) out.push({ problem: "vaccine", vaccine: r.vaccine });
  }
  if (rules.deworm_days !== null && (!pet.dewormed_on || addDays(pet.dewormed_on, rules.deworm_days) < on)) out.push({ problem: "deworming" });
  if (rules.tick_days !== null && (!pet.tick_treated_on || addDays(pet.tick_treated_on, rules.tick_days) < on)) out.push({ problem: "ticks" });
  if (rules.neuter_months !== null && pet.date_of_birth && pet.is_neutered !== true && addMonths(pet.date_of_birth, rules.neuter_months) <= on) {
    out.push({ problem: "neutering" });
  }
  return out;
}
