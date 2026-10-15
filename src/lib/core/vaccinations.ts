import { addDays, type ISODate } from "./dates";

/**
 * Vaccination status, and what to warn about before a stay.
 *
 * Which vaccines a kennel insists on is the kennel's policy, not Wagbook's, so
 * these rules look only at dates: a vaccine that has lapsed, or will lapse
 * before the pet goes home. "Expires soon" means within 30 days.
 */

export type VaccinationStatus = "valid" | "expires_soon" | "expired" | "no_date";

export const EXPIRES_SOON_DAYS = 30;

export function vaccinationStatus(validUntil: ISODate | null, today: ISODate): VaccinationStatus {
  if (!validUntil) return "no_date";
  if (validUntil < today) return "expired";
  if (validUntil <= addDays(today, EXPIRES_SOON_DAYS)) return "expires_soon";
  return "valid";
}

export interface VaccinationWarning {
  vaccine: string | null;
  kind: "none_on_record" | "expired_before_arrival" | "runs_out_during_stay";
  /** The date it lapses, when there is one. */
  date: ISODate | null;
}

/**
 * What staff should know about a pet's vaccinations for a stay. A vaccine that
 * is valid on the last day the pet is here is fine. When a vaccine has several
 * records, the latest valid-until date counts.
 */
export function vaccinationWarnings(records: readonly { vaccine: string; valid_until: ISODate | null }[], stay: { startDate: ISODate; endDate: ISODate }): VaccinationWarning[] {
  if (records.length === 0) return [{ vaccine: null, kind: "none_on_record", date: null }];
  const latest = new Map<string, ISODate | null>();
  for (const r of records) {
    const key = r.vaccine.trim().toLowerCase();
    const seen = latest.get(key);
    if (seen === undefined || (r.valid_until && (!seen || r.valid_until > seen))) latest.set(key, r.valid_until);
  }
  const out: VaccinationWarning[] = [];
  for (const [vaccine, until] of latest) {
    if (!until) continue;
    if (until < stay.startDate) out.push({ vaccine, kind: "expired_before_arrival", date: until });
    else if (until < stay.endDate) out.push({ vaccine, kind: "runs_out_during_stay", date: until });
  }
  return out;
}
