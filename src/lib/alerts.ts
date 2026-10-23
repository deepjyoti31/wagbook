import type { Messages } from "@/messages";

/**
 * Alerts on staff phones (M61): the kinds a person may choose, in the order
 * offered, and the sentence each shows. Must match the alert_kind enum.
 */
export const ALERT_KINDS = ["booking_request", "appointment_request", "intake_form", "food_order", "incident", "unpaid_checkout"] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

export function isAlertKind(value: unknown): value is AlertKind {
  return typeof value === "string" && (ALERT_KINDS as readonly string[]).includes(value);
}

/** What a phone shows for an alert: the kennel as the title, and what happened to which pet. */
export function alertText(m: Pick<Messages, "alerts">, a: { kind: AlertKind; kennel: string; pet_name: string | null }): { title: string; body: string } {
  const pet = a.pet_name ?? m.alerts.somePet;
  return { title: a.kennel, body: m.alerts.says[a.kind].replace("{pet}", pet) };
}
