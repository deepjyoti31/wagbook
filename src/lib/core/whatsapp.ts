import { formatDate, type ISODate } from "./dates";
import { formatMoney, type Minor } from "./money";

/**
 * WhatsApp, the Wagbook way.
 *
 * Wagbook never sends a WhatsApp message itself. It builds a "click to chat"
 * link that opens WhatsApp on the staff member's own phone with the message
 * already typed, and a person taps Send. That means:
 *   - no WhatsApp Business API account, no approval wait, no per-message fee
 *   - the parent sees the kennel's own familiar number
 *   - replies land in the kennel's normal WhatsApp
 *   - photos never pass through Wagbook's servers on their way to WhatsApp
 * See docs/07-whatsapp-and-upi.md.
 */

/**
 * Build a click-to-chat link.
 * With a phone number it opens that chat. Without one, WhatsApp asks the
 * sender to pick a chat or group, which is what kennels want for group updates.
 */
export function whatsappLink(text: string, phoneE164?: string | null): string {
  const digits = (phoneE164 ?? "").replace(/\D/g, "");
  const base = digits ? `https://wa.me/${digits}` : "https://wa.me/";
  return `${base}?text=${encodeURIComponent(text)}`;
}

export interface BookingMessageInput {
  kennelName: string;
  parentName: string;
  petName: string;
  startDate: ISODate;
  endDate: ISODate;
  nights: number;
  totalMinor?: Minor;
  currency?: string;
  stayUrl?: string;
}

/** Sent when a booking is confirmed. */
export function bookingConfirmedMessage(i: BookingMessageInput): string {
  const lines = [
    `Hi ${i.parentName}, ${i.petName}'s stay at ${i.kennelName} is confirmed.`,
    "",
    `Check in: ${formatDate(i.startDate)}`,
    `Check out: ${formatDate(i.endDate)}`,
    `Nights: ${i.nights}`,
  ];
  if (i.totalMinor !== undefined) {
    lines.push(`Estimated total: ${formatMoney(i.totalMinor, { currency: i.currency, trimZeros: true })}`);
  }
  if (i.stayUrl) lines.push("", `Follow the stay here: ${i.stayUrl}`);
  return lines.join("\n");
}

/** Sent with the daily update. The sender attaches photos in WhatsApp. */
export function dailyUpdateMessage(i: { petName: string; note: string; stayUrl?: string }): string {
  const lines = [`${i.petName}'s update: ${i.note.trim()}`];
  if (i.stayUrl) lines.push("", `Photos and the full day: ${i.stayUrl}`);
  return lines.join("\n");
}

/** Sent at checkout with the bill and, if set up, a UPI payment link. */
export function billMessage(i: {
  kennelName: string;
  parentName: string;
  petName: string;
  invoiceNumber: string;
  dueMinor: Minor;
  currency?: string;
  invoiceUrl?: string;
  upiUrl?: string;
}): string {
  const due = formatMoney(i.dueMinor, { currency: i.currency, trimZeros: true });
  const lines = [
    `Hi ${i.parentName}, here is the bill for ${i.petName}'s stay at ${i.kennelName}.`,
    "",
    `Invoice: ${i.invoiceNumber}`,
    `Amount due: ${due}`,
  ];
  if (i.invoiceUrl) lines.push(`View invoice: ${i.invoiceUrl}`);
  if (i.upiUrl) lines.push(`Pay by UPI: ${i.upiUrl}`);
  lines.push("", "Thank you!");
  return lines.join("\n");
}

/** Sent to a new parent so they can fill in their dog's details themselves. */
export function intakeInviteMessage(i: { kennelName: string; intakeUrl: string }): string {
  return [
    `Hello from ${i.kennelName}!`,
    "Please fill in your pet's details before the stay. It takes about 3 minutes:",
    i.intakeUrl,
  ].join("\n");
}
