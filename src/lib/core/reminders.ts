import { addDays, formatDate, type ISODate } from "./dates";
import { formatMoney, type Minor } from "./money";
import { vaccinationWarnings } from "./vaccinations";

/**
 * Reminders for Today's "To send" list: messages a person sends a parent on
 * WhatsApp from their own phone, the day they are due. Wagbook never sends
 * anything itself (docs/07-whatsapp-and-upi.md).
 *
 *   vaccination  a stay starts within a week and a vaccination is missing,
 *                has lapsed, or lapses before the pet goes home
 *   arrival      a stay starts tomorrow
 *   pickup       a pet in the kennel goes home tomorrow
 *   unpaid       a bill issued three or more days ago still has money owed
 *
 * Once sent, a reminder leaves the list for good, except an unpaid bill,
 * which comes back three days after the last reminder.
 */

export type ReminderKind = "vaccination" | "arrival" | "pickup" | "unpaid";

/** How many days ahead a missing vaccination card is asked for. */
export const VACCINATION_REMINDER_DAYS = 7;
/** Days after a bill is issued, and between reminders, before an unpaid bill is on the list. */
export const UNPAID_REMINDER_DAYS = 3;

/** The words of the messages, in the parent's language (m.whatsapp.reminders). */
export interface ReminderWords {
  vaccinationNone: string;
  vaccinationLapses: string;
  arrival: string;
  dropOffFrom: string;
  pickup: string;
  pickUpBy: string;
  unpaid: string;
}

export interface ReminderStay {
  id: string;
  petName: string;
  parentName: string;
  phone: string;
  startDate: ISODate;
  endDate: ISODate;
}

export interface ReminderInput {
  today: ISODate;
  kennelName: string;
  /** The kennel's usual drop-off and pick-up times, "09:00", if set. */
  dropOff?: string | null;
  pickUp?: string | null;
  currency?: string;
  /** Confirmed stays starting from tomorrow, with the pet's vaccinations. */
  upcoming: readonly (ReminderStay & { vaccinations: readonly { vaccine: string; valid_until: ISODate | null }[] })[];
  /** Pets in the kennel. */
  inHouse: readonly ReminderStay[];
  /** Issued bills with money still owed. */
  unpaid: readonly { id: string; number: string; parentName: string; phone: string; issuedOn: ISODate; dueMinor: Minor; url: string }[];
  /** What was sent already. */
  sent: readonly { kind: string; subjectId: string; sentOn: ISODate }[];
}

export interface Reminder {
  kind: ReminderKind;
  /** The booking, or the bill for an unpaid one. */
  subjectId: string;
  parentName: string;
  phone: string;
  /** The pet, or the bill's number. */
  about: string;
  /** The message, ready to send. */
  text: string;
}

function fillIn(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in vars ? String(vars[key]) : whole));
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** The reminders due today, in the order: vaccinations, arrivals, pick-ups, unpaid bills. */
export function remindersToSend(w: ReminderWords, i: ReminderInput, locale = "en-IN"): Reminder[] {
  const tomorrow = addDays(i.today, 1);
  const sentFor = (kind: ReminderKind, id: string) => i.sent.filter((s) => s.kind === kind && s.subjectId === id);
  const date = (d: ISODate) => formatDate(d, locale);
  const out: Reminder[] = [];

  for (const s of i.upcoming) {
    if (s.startDate < tomorrow || s.startDate > addDays(i.today, VACCINATION_REMINDER_DAYS) || sentFor("vaccination", s.id).length) continue;
    const warning = vaccinationWarnings(s.vaccinations, { startDate: s.startDate, endDate: s.endDate })[0];
    if (!warning) continue;
    const vars = { parent: firstName(s.parentName), pet: s.petName, kennel: i.kennelName, date: date(s.startDate) };
    const text =
      warning.kind === "none_on_record" || !warning.date
        ? fillIn(w.vaccinationNone, vars)
        : fillIn(w.vaccinationLapses, { ...vars, vaccine: (warning.vaccine ?? "").replaceAll("_", " "), until: date(warning.date) });
    out.push({ kind: "vaccination", subjectId: s.id, parentName: s.parentName, phone: s.phone, about: s.petName, text });
  }

  for (const s of i.upcoming) {
    if (s.startDate !== tomorrow || sentFor("arrival", s.id).length) continue;
    const lines = [fillIn(w.arrival, { parent: firstName(s.parentName), pet: s.petName, kennel: i.kennelName, date: date(s.startDate) })];
    if (i.dropOff) lines.push(fillIn(w.dropOffFrom, { time: i.dropOff.slice(0, 5) }));
    out.push({ kind: "arrival", subjectId: s.id, parentName: s.parentName, phone: s.phone, about: s.petName, text: lines.join(" ") });
  }

  for (const s of i.inHouse) {
    if (s.endDate !== tomorrow || sentFor("pickup", s.id).length) continue;
    const lines = [fillIn(w.pickup, { parent: firstName(s.parentName), pet: s.petName, kennel: i.kennelName, date: date(s.endDate) })];
    if (i.pickUp) lines.push(fillIn(w.pickUpBy, { time: i.pickUp.slice(0, 5) }));
    out.push({ kind: "pickup", subjectId: s.id, parentName: s.parentName, phone: s.phone, about: s.petName, text: lines.join(" ") });
  }

  const quietSince = addDays(i.today, -UNPAID_REMINDER_DAYS);
  for (const b of i.unpaid) {
    if (b.dueMinor <= 0 || b.issuedOn > quietSince || sentFor("unpaid", b.id).some((s) => s.sentOn > quietSince)) continue;
    const text = fillIn(w.unpaid, {
      parent: firstName(b.parentName),
      kennel: i.kennelName,
      number: b.number,
      amount: formatMoney(b.dueMinor, { currency: i.currency, locale, trimZeros: true }),
      url: b.url,
    });
    out.push({ kind: "unpaid", subjectId: b.id, parentName: b.parentName, phone: b.phone, about: b.number, text });
  }
  return out;
}
