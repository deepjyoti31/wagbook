import { addDays, diffDays, type ISODate } from "./dates";
import { sizeBand, zonedInstant, type PortionSettings, type SizeBand } from "./food";
import type { Minor } from "./money";
import type { LineInput } from "./tax";

/**
 * Appointments (Phase 2, M34 to M37, D46): services booked by the hour in a
 * place that takes one at a time. Times are instants; the day an appointment
 * is on is the kennel's, in its time zone. Pure: no database, no I/O.
 */

export const APPOINTMENT_KINDS = ["groom", "swim", "training", "party", "other"] as const;
export type AppointmentKind = (typeof APPOINTMENT_KINDS)[number];
export const APPOINTMENT_STATUSES = ["requested", "confirmed", "done", "no_show", "cancelled"] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];
export const PET_COATS = ["short", "double", "long", "curly", "wire"] as const;
export type PetCoat = (typeof PET_COATS)[number];
export const PRICINGS = ["fixed", "by_size", "by_coat", "quote"] as const;
export type Pricing = (typeof PRICINGS)[number];
export const SIZE_BANDS = ["small", "medium", "large"] as const satisfies readonly SizeBand[];
export const PACKAGE_DAYS = ["first", "middle", "last"] as const;
export type PackageDay = (typeof PACKAGE_DAYS)[number];

/** Free times are offered every so many minutes from a place's opening. Must match first_free_start(). */
export const SLOT_STEP_MINUTES = 30;
/** How many days before a groom is due its reminder goes on Today's list. */
export const GROOM_REMINDER_DAYS_AHEAD = 3;

export interface ServicePrice {
  size: SizeBand | null;
  coat: PetCoat | null;
  breed: string | null;
  price_minor: Minor;
}

/**
 * What a pet pays for a service: the fixed price; by size, the price for its
 * size band from its latest weight; by coat, a price for its breed, else its
 * coat; else the service's own price. Null on quote. Must match
 * appointment_price() in the database.
 */
export function appointmentPrice(
  service: { pricing: Pricing; price_minor: Minor },
  pet: { weight_g: number | null; coat: PetCoat | null; breed: string | null },
  prices: readonly ServicePrice[],
  bands: Pick<PortionSettings, "small_dog_max_g" | "medium_dog_max_g">,
): Minor | null {
  if (service.pricing === "quote") return null;
  if (service.pricing === "fixed") return service.price_minor;
  if (service.pricing === "by_size") {
    if (pet.weight_g === null) return service.price_minor;
    const band = sizeBand(pet.weight_g, bands as PortionSettings);
    return prices.find((p) => p.size === band)?.price_minor ?? service.price_minor;
  }
  const breed = pet.breed?.trim().toLowerCase();
  const byBreed = breed ? prices.find((p) => p.breed !== null && p.breed.trim().toLowerCase() === breed) : undefined;
  if (byBreed) return byBreed.price_minor;
  return prices.find((p) => p.coat !== null && p.coat === pet.coat)?.price_minor ?? service.price_minor;
}

/** "HH:MM" as minutes after midnight. "24:00" is 1440. */
export function clockMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** Minutes after midnight as "HH:MM". */
export function minutesClock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** An instant's day in a time zone, as an ISO date. */
export function localDate(instant: Date | string, timeZone: string): ISODate {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(instant));
  const n = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${n("year")}-${n("month")}-${n("day")}`;
}

/** An instant's clock time in a time zone, "HH:MM". */
export function localClock(instant: Date | string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(instant));
  const n = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${n("hour")}:${n("minute")}`;
}

export interface Busy {
  start: Date | string;
  end: Date | string;
}

export interface FreeTimesInput {
  day: ISODate;
  /** The place's hours, "HH:MM". */
  opens: string;
  closes: string;
  minutes: number;
  cleanup: number;
  timeZone: string;
  now: Date;
  /** What holds the place: each appointment from its start to the end of its clean-up. */
  place: readonly Busy[];
  /** The pet's other appointments, start to end. */
  pet?: readonly Busy[];
  /** The person's other appointments, start to end. */
  person?: readonly Busy[];
  /** Must end by this clock time ("HH:MM"), as a groom before pick-up. */
  latestEnd?: string | null;
}

const overlaps = (aStart: number, aEnd: number, b: Busy) => aStart < new Date(b.end).getTime() && new Date(b.start).getTime() < aEnd;

/**
 * The free start times on a day, every 30 minutes from the place's opening:
 * the appointment ends by closing (and by latestEnd), starts after now, and
 * neither the place (with clean-up), the pet nor the person is taken. Must
 * agree with first_free_start() in the database.
 */
export function freeTimes(i: FreeTimesInput): string[] {
  const open = clockMinutes(i.opens);
  const close = Math.min(clockMinutes(i.closes), i.latestEnd ? clockMinutes(i.latestEnd) : Infinity);
  const out: string[] = [];
  for (let start = open; start + i.minutes <= close; start += SLOT_STEP_MINUTES) {
    const t = zonedInstant(i.day, minutesClock(start), i.timeZone).getTime();
    if (t <= i.now.getTime()) continue;
    const end = t + i.minutes * 60_000;
    const held = end + i.cleanup * 60_000;
    if (i.place.some((b) => overlaps(t, held, b))) continue;
    if ((i.pet ?? []).some((b) => overlaps(t, end, b))) continue;
    if ((i.person ?? []).some((b) => overlaps(t, end, b))) continue;
    out.push(minutesClock(start));
  }
  return out;
}

/** The day of a stay a package's appointment goes on. Must match apply_package(). */
export function packageDayDate(day: PackageDay, start: ISODate, end: ISODate): ISODate {
  if (day === "first") return start;
  if (day === "last") return end;
  return addDays(start, Math.floor(diffDays(start, end) / 2));
}

/** Appointments that go on a bill: confirmed, done or a no-show. Must match invoice_expected_lines(). */
export const BILLED_APPOINTMENT_STATUSES = ["confirmed", "done", "no_show"] as const satisfies readonly AppointmentStatus[];

export interface BillableAppointment {
  id: string;
  status: AppointmentStatus;
  starts_at: string;
  service_name: string;
  price_minor: Minor | null;
  tax_rate_bp: number;
  sac_code: string | null;
  course_id: string | null;
  in_package: boolean;
}

export interface BillableAddOn {
  appointment_id: string;
  description: string;
  quantity: number;
  unit_price_minor: Minor;
  tax_rate_bp: number;
  sac_code: string | null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Appointments with no price yet (on quote) that would go on a bill: it cannot be made until they are priced. */
export function unpricedAppointments<A extends BillableAppointment>(appointments: readonly A[]): A[] {
  return appointments.filter((a) => (BILLED_APPOINTMENT_STATUSES as readonly string[]).includes(a.status) && !a.course_id && !a.in_package && a.price_minor === null);
}

/**
 * The bill lines of a pet's appointments: each confirmed, done or not come
 * (not a course or package session, which are paid for already) at its price,
 * then each add-on of those and of course and package sessions. Stored with
 * the bill, so in English like the rest of its lines ("Full groom for
 * Biscuit (14 Nov, 10:00)"). Must match invoice_expected_lines().
 */
export function appointmentLines(petName: string, appointments: readonly BillableAppointment[], addOns: readonly BillableAddOn[], timeZone: string): LineInput[] {
  const held = appointments
    .filter((a) => (BILLED_APPOINTMENT_STATUSES as readonly string[]).includes(a.status))
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const when = (a: BillableAppointment) => {
    const d = localDate(a.starts_at, timeZone);
    return `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]}, ${localClock(a.starts_at, timeZone)}`;
  };
  return held.flatMap((a) => [
    ...(a.course_id || a.in_package
      ? []
      : [{ description: `${a.service_name} for ${petName} (${when(a)})`.slice(0, 300), quantity: 1, unitPriceMinor: a.price_minor ?? 0, taxRateBp: a.tax_rate_bp, sacCode: a.sac_code }]),
    ...addOns
      .filter((x) => x.appointment_id === a.id)
      .map((x) => ({ description: `${x.description} for ${petName} (${when(a)})`.slice(0, 300), quantity: x.quantity, unitPriceMinor: x.unit_price_minor, taxRateBp: x.tax_rate_bp, sacCode: x.sac_code })),
  ]);
}

export interface GroomCard {
  petId: string;
  petName: string;
  parentName: string;
  phone: string;
  everyWeeks: number | null;
  /** The last groom done: its appointment and the kennel's day it was on. */
  last: { id: string; day: ISODate } | null;
}

/**
 * Pets due a groom again, from a few days before: their last groom plus their
 * weeks. Each is due once per groom (the reminder names the last groom), so a
 * new groom starts the count again.
 */
export function groomsDue(cards: readonly GroomCard[], today: ISODate, sentFor: ReadonlySet<string>): (GroomCard & { dueOn: ISODate })[] {
  return cards.flatMap((c) => {
    if (!c.everyWeeks || !c.last || sentFor.has(c.last.id)) return [];
    const dueOn = addDays(c.last.day, c.everyWeeks * 7);
    return addDays(dueOn, -GROOM_REMINDER_DAYS_AHEAD) <= today ? [{ ...c, dueOn }] : [];
  });
}
