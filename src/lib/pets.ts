import type { VaccinationWarning } from "./core";
import { formatDate } from "./core";
import { fill } from "./i18n";
import type { Messages } from "@/messages";

/**
 * Warning tags offered when adding a pet. Staff see these in red wherever the
 * pet appears. The database stores them as free text (pets.flags), so adding
 * a tag here needs no migration; its words go in m.labels.flags.
 */
export const PET_FLAGS = ["escape_risk", "bite_history", "dog_reactive", "anxious", "on_medication", "senior"] as const;

export const INCIDENT_CATEGORIES = ["illness", "injury", "fight", "escape", "behaviour", "property", "other"] as const;

/** A stored incident category in the reader's words (an unknown one as stored). */
export function incidentCategoryText(m: Messages, category: string): string {
  return (m.labels.incidentCategory as Record<string, string>)[category] ?? category;
}

/** One line for a vaccination warning, as staff read it. */
export function vaccinationWarningText(t: { m: Messages; locale: string }, w: VaccinationWarning): string {
  const v = t.m.vaccinations;
  if (w.kind === "none_on_record") return v.noneOnRecord;
  const vaccine = (w.vaccine ?? v.aVaccine).replaceAll("_", " ");
  const date = w.date ? formatDate(w.date, t.locale) : "";
  return fill(w.kind === "expired_before_arrival" ? v.expiredBefore : v.runsOutDuring, { vaccine, date });
}
