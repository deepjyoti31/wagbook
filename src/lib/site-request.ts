/**
 * Requests from a kennel's own website (M68): its booking form and its food
 * order form send here (/api/site/{slug}) instead of to Wagbook's own pages.
 * The route checks where the request came from, reads it with SiteRequest,
 * and turns it into what the existing public functions take: an intake form
 * (submit_intake, as the booking form for new parents does) or a food order
 * (submit_food_order). Nothing here trusts a price: the database works the
 * amount out.
 *
 * The format is documented in docs/07-whatsapp-and-upi.md, "A kennel's own website".
 */

import { z } from "zod";
import { normalizePhone, normalizePostalCode, portionGrams, type PortionSettings } from "@/lib/core";
import { IntakePayload } from "@/lib/intake";

/** A request faster than this from opening the page is a robot's: answered as saved, kept nowhere. */
export const MIN_FILL_MS = 2500;

/** The largest request read, in characters. */
export const MAX_SITE_BODY = 20_000;

/**
 * A kennel's website as Settings keeps it: https:// and a name, with nothing
 * after it (http://localhost too, for trying a website out). The database
 * checks the same (organizations_website_is_origin).
 */
export function isWebsiteOrigin(value: string): boolean {
  return (
    value.length <= 200 &&
    /^(https:\/\/[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+|http:\/\/localhost)(:[0-9]{1,5})?$/.test(value)
  );
}

/**
 * Whether a browser on `origin` may send to a kennel whose website is
 * `website`: the same address, or the same with or without "www.".
 */
export function originAllowed(origin: string | null, website: string | null): boolean {
  if (!origin || !website) return false;
  const o = origin.toLowerCase();
  if (o === website) return true;
  const twin = website.replace(/^(https?:\/\/)(www\.)?/, (_, scheme: string, www: string | undefined) => (www ? scheme : `${scheme}www.`));
  return o === twin;
}

const text = (max: number) =>
  z
    .string()
    .transform((v) => v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max))
    .nullish()
    .transform((v) => (v ? v : null));
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullish()
  .catch(null)
  .transform((v) => v ?? null);

export const APPOINTMENT_KINDS = ["grooming", "swimming", "training", "party"] as const;
export type AppointmentKind = (typeof APPOINTMENT_KINDS)[number];

/** What a kennel's website sends. Unknown fields are ignored; text is cut to its length. */
export const SiteRequest = z.object({
  v: z.literal(1),
  kind: z.enum(["booking", "food", "paid"]),
  ref: z
    .string()
    .regex(/^[A-Za-z0-9-]{4,40}$/)
    .nullish()
    .catch(null),
  hp: z.string().nullish().catch(null),
  elapsed_ms: z.number().nullish().catch(null),
  parent: z
    .object({
      name: text(120),
      phone: text(30),
      address: text(300),
      area: text(120),
      postal_code: text(12),
    })
    .nullish(),
  pet: z
    .object({
      name: text(80),
      breed: text(80),
      weight_kg: z.number().min(0.5).max(199).nullish().catch(null),
      vaccinated: z.boolean().nullish().catch(null),
      notes: text(1500),
      avoid_foods: text(200),
    })
    .nullish(),
  booking: z
    .object({
      service: z.enum(["boarding", "daycare", ...APPOINTMENT_KINDS]),
      start_date: day,
      end_date: day,
      pickup: z.boolean().nullish().catch(false),
      notes: text(1500),
    })
    .nullish(),
  food: z
    .object({
      kind: z.enum(["trial", "subscription", "item"]),
      plan: z.enum(["full", "topper"]).nullish().catch("full"),
      starts_on: day,
      slot: z.enum(["morning", "afternoon", "evening"]).nullish().catch("morning"),
      inscription: text(60),
      weekdays: z.array(z.number().int().min(1).max(7)).max(7).nullish().catch(null),
      door_note: text(300),
      note: text(1000),
    })
    .nullish(),
  token: z
    .string()
    .regex(/^[A-Za-z0-9_-]{64}$/)
    .nullish()
    .catch(null),
  consent: z.boolean().nullish(),
  consent_text: text(2000),
  source: z
    .object({
      page: text(200),
      referrer: text(200),
      utm_source: text(60),
      utm_medium: text(60),
      utm_campaign: text(60),
    })
    .nullish()
    .catch(null),
});
export type SiteRequest = z.infer<typeof SiteRequest>;

/** A request that cannot be sent on: which words to show the visitor. */
export type Refusal = "name" | "phone" | "pet" | "dates" | "address" | "pin" | "weight" | "consent" | "service" | "food";

/** True for what a robot sends: the hidden field filled, or sent faster than a person could. */
export function looksLikeRobot(r: Pick<SiteRequest, "hp" | "elapsed_ms">): boolean {
  return Boolean(r.hp && r.hp.trim()) || (typeof r.elapsed_ms === "number" && r.elapsed_ms < MIN_FILL_MS);
}

/** Campaign tags, for knowing which advertising works: "instagram / cpc / launch". */
export function sourceText(source: SiteRequest["source"]): string | null {
  if (!source) return null;
  const tags = [source.utm_source, source.utm_medium, source.utm_campaign].filter(Boolean);
  return tags.length > 0 ? tags.join(" / ").slice(0, 200) : null;
}

function parentOf(r: SiteRequest, country: string): { name: string; phone: string } | Refusal {
  const name = r.parent?.name;
  if (!name || name.length < 2) return "name";
  const phone = normalizePhone(r.parent?.phone ?? "", country === "IN" ? "IN" : null);
  if (!phone) return "phone";
  return { name, phone };
}

/**
 * A booking request as the intake form the booking form for new parents
 * sends (M41). A stay is made a request on Accept; an appointment names the
 * kennel's service of that kind and is booked by staff, since the website
 * asks for a day and not a time. `services` is get_public_intake_form's list.
 */
export function bookingPayload(
  r: SiteRequest,
  kennel: { country: string; services: readonly { id: string; kind: string }[] },
): IntakePayload | Refusal {
  const parent = parentOf(r, kennel.country);
  if (typeof parent === "string") return parent;
  if (!r.pet?.name) return "pet";
  const b = r.booking;
  if (!b) return "service";
  // A website may send no dates ("call me"): staff agree them with the parent.
  if (b.end_date && !b.start_date) return "dates";
  if (b.start_date && b.end_date && b.end_date < b.start_date) return "dates";
  if (r.consent !== true) return "consent";
  const pinTyped = r.parent?.postal_code ?? null;
  const postal = pinTyped === null ? null : normalizePostalCode(pinTyped, kennel.country);
  if (pinTyped !== null && postal === null) return "pin";
  // Pick-up without an address is asked for all the same: staff take the address when they call.

  const appointment = (APPOINTMENT_KINDS as readonly string[]).includes(b.service);
  const service = appointment ? (kennel.services.find((s) => s.kind === b.service) ?? null) : null;
  const parsed = IntakePayload.safeParse({
    v: 1,
    parent: { name: parent.name, phone: parent.phone, address: r.parent?.address, area: r.parent?.area, postal_code: postal },
    pets: [
      {
        name: r.pet.name,
        species: "dog",
        breed: r.pet.breed,
        weight_kg: r.pet.weight_kg ? String(Math.round(r.pet.weight_kg * 100) / 100) : null,
        allergies: r.pet.avoid_foods,
        behaviour_notes: r.pet.notes,
        vaccinations: [],
      },
    ],
    stay: {
      kind: b.service === "daycare" ? "daycare" : "boarding",
      start_date: b.start_date,
      end_date: appointment || !b.start_date ? b.start_date : (b.end_date ?? b.start_date),
      notes: b.notes,
    },
    // An appointment the kennel does not offer is left for staff: no request is made from it.
    request:
      appointment && !service
        ? undefined
        : { make: "true", service_id: service?.id ?? null, time: null, pickup: b.pickup ? "true" : "false", vaccinations_ok: r.pet.vaccinated ? "true" : "false" },
    site: { ref: r.ref, ...r.source },
    consent: true,
  });
  return parsed.success ? parsed.data : "service";
}

/**
 * A food order as submit_food_order takes it. The grams a day are worked out
 * here from the dog's weight with the kennel's own portions, never taken from
 * the website; the database works out the price from them.
 */
export function foodPayload(r: SiteRequest, kennel: { country: string; portions: PortionSettings }): Record<string, unknown> | Refusal {
  const parent = parentOf(r, kennel.country);
  if (typeof parent === "string") return parent;
  const f = r.food;
  if (!f) return "food";
  const pet = r.pet?.name ?? f.inscription;
  if (!pet) return "pet";
  const weightG = r.pet?.weight_kg ? Math.round(r.pet.weight_kg * 1000) : null;
  if (f.kind !== "item" && weightG === null) return "weight";
  if (f.kind === "item" && !f.starts_on) return "dates";
  if (!r.parent?.address) return "address";
  const postal = normalizePostalCode(r.parent?.postal_code ?? "", kennel.country);
  if (!postal) return "pin";
  if (r.consent !== true) return "consent";
  const plan = f.plan ?? "full";
  return {
    kind: f.kind,
    parent_name: parent.name,
    phone: parent.phone,
    pet_name: pet,
    weight_g: weightG,
    plan,
    grams_per_day: f.kind === "subscription" && weightG ? portionGrams({ weightG, plan, goal: "keep" }, kennel.portions) : null,
    weekdays: f.weekdays ?? [],
    starts_on: f.starts_on,
    slot: f.slot ?? "morning",
    inscription: f.kind === "item" ? f.inscription : null,
    line: r.parent.address,
    area: r.parent.area ?? null,
    postal_code: postal,
    door_note: f.door_note,
    note: f.note,
    consent: true,
    consent_text: r.consent_text ?? "",
    site_ref: r.ref ?? null,
    site_source: sourceText(r.source),
  };
}
