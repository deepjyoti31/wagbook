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

/**
 * The words of each message, in the language of whoever reads it: the
 * parent's for messages to parents (organizations.parent_language). They come
 * from the message files (m.whatsapp); a {placeholder} is filled here.
 */
export interface WhatsappWords {
  bookingConfirmed: string;
  checkIn: string;
  checkOut: string;
  nights: string;
  estimatedTotal: string;
  followStay: string;
  update: string;
  updatePhotos: string;
  bill: string;
  invoice: string;
  amountDue: string;
  viewInvoice: string;
  payByUpi: string;
  thanks: string;
  intakeHello: string;
  intakeAsk: string;
}

function fillIn(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in vars ? String(vars[key]) : whole));
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

/** Sent when a booking is confirmed. `locale` formats the dates and money. */
export function bookingConfirmedMessage(w: WhatsappWords, i: BookingMessageInput, locale = "en-IN"): string {
  const lines = [
    fillIn(w.bookingConfirmed, { parent: i.parentName, pet: i.petName, kennel: i.kennelName }),
    "",
    fillIn(w.checkIn, { date: formatDate(i.startDate, locale) }),
    fillIn(w.checkOut, { date: formatDate(i.endDate, locale) }),
    fillIn(w.nights, { n: i.nights }),
  ];
  if (i.totalMinor !== undefined) {
    lines.push(fillIn(w.estimatedTotal, { amount: formatMoney(i.totalMinor, { currency: i.currency, locale, trimZeros: true }) }));
  }
  if (i.stayUrl) lines.push("", fillIn(w.followStay, { url: i.stayUrl }));
  return lines.join("\n");
}

/** Sent with the daily update. The sender attaches photos in WhatsApp. */
export function dailyUpdateMessage(w: WhatsappWords, i: { petName: string; note: string; stayUrl?: string }): string {
  const lines = [fillIn(w.update, { pet: i.petName, note: i.note.trim() })];
  if (i.stayUrl) lines.push("", fillIn(w.updatePhotos, { url: i.stayUrl }));
  return lines.join("\n");
}

/** Sent at checkout with the bill and, if set up, a UPI payment link. */
export function billMessage(
  w: WhatsappWords,
  i: {
    kennelName: string;
    parentName: string;
    petName: string;
    invoiceNumber: string;
    dueMinor: Minor;
    currency?: string;
    invoiceUrl?: string;
    upiUrl?: string;
  },
  locale = "en-IN",
): string {
  const due = formatMoney(i.dueMinor, { currency: i.currency, locale, trimZeros: true });
  const lines = [
    fillIn(w.bill, { parent: i.parentName, pet: i.petName, kennel: i.kennelName }),
    "",
    fillIn(w.invoice, { number: i.invoiceNumber }),
    fillIn(w.amountDue, { amount: due }),
  ];
  if (i.invoiceUrl) lines.push(fillIn(w.viewInvoice, { url: i.invoiceUrl }));
  if (i.upiUrl) lines.push(fillIn(w.payByUpi, { url: i.upiUrl }));
  lines.push("", w.thanks);
  return lines.join("\n");
}

/** Sent to a new parent so they can fill in their dog's details themselves. */
export function intakeInviteMessage(w: WhatsappWords, i: { kennelName: string; intakeUrl: string }): string {
  return [fillIn(w.intakeHello, { kennel: i.kennelName }), w.intakeAsk, i.intakeUrl].join("\n");
}
