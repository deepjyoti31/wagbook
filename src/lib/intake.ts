import { z } from "zod";

/**
 * The shape of an intake form submission (version 1).
 *
 * The same schema is used to build the payload on the way in (the public form
 * action) and to read it safely on the way out (the staff review screen),
 * because the stored JSON came from the open internet and is never trusted.
 * The database function submit_intake() enforces the hard limits again.
 *
 * The schema holds no words: the public form's action turns the first issue
 * into a sentence in the parent's language (src/app/i/[slug]/actions.ts).
 */

const short = z.string().trim().max(200);
const long = z.string().trim().max(2000);
const optional = <T extends z.ZodType>(schema: T) => schema.nullish().transform((v) => (v === "" || v === undefined ? null : v));

export const IntakeVaccination = z.object({
  vaccine: z.string().trim().min(1).max(60),
  given_on: optional(short),
  valid_until: optional(short),
});

export const IntakePet = z.object({
  name: z.string().trim().min(1).max(80),
  species: z.enum(["dog", "cat", "other"]).catch("dog"),
  breed: optional(short),
  sex: z.enum(["male", "female", "unknown"]).catch("unknown"),
  is_neutered: z.boolean().nullish().catch(null),
  date_of_birth: optional(short),
  weight_kg: optional(short),
  food_notes: optional(long),
  medical_notes: optional(long),
  allergies: optional(short),
  behaviour_notes: optional(long),
  vet_name: optional(short),
  vet_phone: optional(short),
  vaccinations: z.array(IntakeVaccination).max(10).catch([]),
});

export const IntakePayload = z.object({
  v: z.literal(1),
  parent: z.object({
    name: z.string().trim().min(2).max(120),
    phone: z.string().regex(/^\+[1-9][0-9]{7,14}$/),
    email: optional(short),
    address: optional(short),
    area: optional(short),
    postal_code: optional(z.string().trim().max(10)),
    city: optional(short),
    emergency_name: optional(short),
    emergency_phone: optional(short),
  }),
  pets: z.array(IntakePet).min(1).max(6),
  stay: z.object({
    kind: z.enum(["boarding", "daycare"]).catch("boarding"),
    start_date: optional(short),
    end_date: optional(short),
    notes: optional(long),
  }),
  consent: z.literal(true),
});

export type IntakePayload = z.infer<typeof IntakePayload>;
