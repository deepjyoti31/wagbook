import type { VaccinationStatus, VaccinationWarning } from "./core";
import { formatDate } from "./core";

/**
 * Warning tags offered when adding a pet. Staff see these in red wherever the
 * pet appears. The database stores them as free text (pets.flags), so adding
 * a tag here needs no migration.
 */
export const PET_FLAGS = ["escape_risk", "bite_history", "dog_reactive", "anxious", "on_medication", "senior"] as const;


export const INCIDENT_CATEGORIES = ["illness", "injury", "fight", "escape", "behaviour", "property", "other"] as const;

export const INCIDENT_CATEGORY_LABEL: Record<(typeof INCIDENT_CATEGORIES)[number], string> = {
  illness: "Illness",
  injury: "Injury",
  fight: "Fight",
  escape: "Escape",
  behaviour: "Behaviour",
  property: "Damage",
  other: "Other",
};

export const SEVERITY_LABEL = {
  low: "Low: worth noting",
  medium: "Medium: tell the parent today",
  high: "High: tell the parent and a vet now",
} as const;

export const SEVERITY_SHORT = { low: "Low", medium: "Medium", high: "High" } as const;

export const VACCINATION_STATUS_LABEL: Record<VaccinationStatus, string> = {
  valid: "Valid",
  expires_soon: "Expires soon",
  expired: "Expired",
  no_date: "No expiry date",
};

/** One line for a vaccination warning, as staff read it. */
export function vaccinationWarningText(w: VaccinationWarning): string {
  if (w.kind === "none_on_record") return "No vaccinations on record. Ask for the certificates.";
  const name = (w.vaccine ?? "A vaccine").replaceAll("_", " ");
  const date = w.date ? formatDate(w.date) : "";
  return w.kind === "expired_before_arrival" ? `${name} expired on ${date}.` : `${name} runs out on ${date}, before the pet goes home.`;
}
