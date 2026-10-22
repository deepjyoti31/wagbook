/**
 * Bringing in parents, pets and vaccinations from a spreadsheet (M47).
 *
 * The kennel downloads the template (IMPORT_COLUMNS), fills one row per pet,
 * saves it as CSV and uploads it. readImport() reads every row and either
 * turns it into what import_parents_and_pets() writes, or names what is wrong
 * with it, so the good rows go in and the rest can be fixed and sent again.
 * Several pets of one parent are several rows with the same phone number; the
 * first row's parent details are the ones kept.
 */

import { isISODate, type ISODate } from "./dates";
import { normalizePhone } from "./phone";

/** The template's columns, in order. Their names stay in English in every language. */
export const IMPORT_COLUMNS = [
  "parent_name", "phone", "email", "address", "area", "pin_code", "city", "emergency_name", "emergency_phone", "parent_notes",
  "pet_name", "species", "breed", "sex", "date_of_birth", "neutered", "weight_kg", "microchip",
  "food_notes", "medical_notes", "allergies", "behaviour_notes", "vet_name", "vet_phone",
  "vaccine_1", "given_on_1", "valid_until_1", "vaccine_2", "given_on_2", "valid_until_2", "vaccine_3", "given_on_3", "valid_until_3",
] as const;

export type ImportColumn = (typeof IMPORT_COLUMNS)[number];

/** Without these the file cannot be read at all. */
export const REQUIRED_COLUMNS: readonly ImportColumn[] = ["parent_name", "phone", "pet_name"];

/** At most this many rows in one file; import_parents_and_pets() refuses more (WB240). */
export const MAX_IMPORT_ROWS = 2000;

/** What import_parents_and_pets() takes for one row. */
export interface ImportRow {
  parent: {
    name: string;
    phone: string;
    email: string | null;
    address: string | null;
    area: string | null;
    postal_code: string | null;
    city: string | null;
    emergency_name: string | null;
    emergency_phone: string | null;
    notes: string | null;
  };
  pet: {
    name: string;
    species: "dog" | "cat" | "other";
    breed: string | null;
    sex: "male" | "female" | "unknown";
    is_neutered: boolean | null;
    date_of_birth: ISODate | null;
    weight_g: number | null;
    microchip: string | null;
    food_notes: string | null;
    medical_notes: string | null;
    allergies: string | null;
    behaviour_notes: string | null;
    vet_name: string | null;
    vet_phone: string | null;
  };
  vaccinations: { vaccine: string; given_on: ISODate | null; valid_until: ISODate | null }[];
}

/** Why a row cannot go in. Each has a sentence in m.importing.problems. */
export type ImportProblemKind =
  | "parentName"
  | "phone"
  | "petName"
  | "species"
  | "sex"
  | "date"
  | "future"
  | "neutered"
  | "weight"
  | "pin"
  | "email"
  | "vaccine"
  | "vaccineDates"
  | "tooLong"
  | "samePet";

export interface ImportProblem {
  /** The line in the file, counting the header as line 1. */
  line: number;
  kind: ImportProblemKind;
  /** The column at fault, when there is one. */
  column?: ImportColumn;
}

export interface ImportReading {
  rows: { line: number; row: ImportRow }[];
  problems: ImportProblem[];
  /** The lines with problems, as they were in the file, for downloading and fixing. */
  badLines: { line: number; cells: string[] }[];
  header: string[];
  /** Columns the file has that the template does not; they are ignored. */
  unknownColumns: string[];
  /** Required columns the file lacks; when any is missing, no row is read. */
  missingColumns: ImportColumn[];
  /** True when the file had more rows than MAX_IMPORT_ROWS; only that many were read. */
  cutShort: boolean;
}

/**
 * Split CSV text into rows of cells (RFC 4180): quoted cells may hold commas,
 * quotes ("") and line breaks; lines end in LF or CRLF; a byte order mark is
 * dropped; empty lines are skipped.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const endRow = () => {
    row.push(cell);
    if (row.length > 1 || row[0].trim() !== "") rows.push(row);
    row = [];
    cell = "";
  };
  for (; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"' && cell === "") quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n") endRow();
    else if (c === "\r") {
      if (text[i + 1] === "\n") i++;
      endRow();
    } else cell += c;
  }
  if (cell !== "" || row.length > 0) endRow();
  return rows;
}

/**
 * A date as people write it in a spreadsheet: 2021-03-01, 01/03/2021,
 * 1-3-2021 or 01.03.2021 (day first, as in India). Null when it is not a real
 * date.
 */
export function readDate(text: string): ISODate | null {
  const t = text.trim();
  if (isISODate(t)) return t;
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  if (!m) return null;
  const iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return isISODate(iso) ? iso : null;
}

const YES = new Set(["yes", "y", "true", "1", "haan", "ha"]);
const NO = new Set(["no", "n", "false", "0", "nahi"]);
const SPECIES: Record<string, ImportRow["pet"]["species"]> = { dog: "dog", cat: "cat", other: "other", puppy: "dog", kitten: "cat" };
const SEX: Record<string, ImportRow["pet"]["sex"]> = { male: "male", m: "male", female: "female", f: "female", unknown: "unknown" };
const INDIA_PIN = /^[1-9][0-9]{5}$/;
const POSTAL = /^(?=.*[0-9])[A-Z0-9][A-Z0-9 -]{1,8}[A-Z0-9]$/;

/** The longest each kind of text may be, as the database allows. */
const LIMITS: Partial<Record<ImportColumn, number>> = { parent_name: 120, pet_name: 80, address: 300, area: 120, vaccine_1: 60, vaccine_2: 60, vaccine_3: 60 };

/**
 * Read a whole file. `country` decides what a phone number without +
 * means and what a PIN code looks like; `today` is the kennel's today, after
 * which no birthday or vaccination can be.
 */
export function readImport(text: string, opts: { country: string; today: ISODate }): ImportReading {
  const table = parseCsv(text);
  const header = (table[0] ?? []).map((h) => h.trim());
  const index = new Map<string, number>();
  header.forEach((h, i) => {
    const key = h.toLowerCase().replace(/[\s-]+/g, "_");
    if (!index.has(key)) index.set(key, i);
  });
  const known = new Set<string>(IMPORT_COLUMNS);
  const unknownColumns = header.filter((h) => h !== "" && !known.has(h.toLowerCase().replace(/[\s-]+/g, "_")));
  const missingColumns = REQUIRED_COLUMNS.filter((c) => !index.has(c));
  const body = table.slice(1);
  const cutShort = body.length > MAX_IMPORT_ROWS;
  const reading: ImportReading = { rows: [], problems: [], badLines: [], header, unknownColumns, missingColumns, cutShort };
  if (missingColumns.length > 0) return reading;

  const defaultCountry = opts.country === "IN" ? "IN" : null;
  const seenPets = new Set<string>();
  body.slice(0, MAX_IMPORT_ROWS).forEach((cells, n) => {
    const line = n + 2;
    const problems: ImportProblem[] = [];
    const get = (c: ImportColumn): string => {
      const i = index.get(c);
      // csvCell() guards text that looks like a formula with an apostrophe; a
      // file Wagbook wrote, or one a spreadsheet kept it in, reads as typed.
      const value = (i === undefined ? "" : (cells[i] ?? "")).trim().replace(/^'(?=[=+\-@])/, "");
      const limit = LIMITS[c] ?? 2000;
      if (value.length > limit) problems.push({ line, kind: "tooLong", column: c });
      return value.slice(0, limit);
    };
    const optional = (c: ImportColumn) => get(c) || null;
    const date = (c: ImportColumn): ISODate | null => {
      const value = get(c);
      if (!value) return null;
      const d = readDate(value);
      if (!d) problems.push({ line, kind: "date", column: c });
      else if (d > opts.today && !c.startsWith("valid_until")) problems.push({ line, kind: "future", column: c });
      return d;
    };

    const parentName = get("parent_name");
    if (!parentName) problems.push({ line, kind: "parentName", column: "parent_name" });
    const phone = normalizePhone(get("phone"), defaultCountry);
    if (!phone) problems.push({ line, kind: "phone", column: "phone" });
    const emergencyText = get("emergency_phone");
    const emergencyPhone = emergencyText ? normalizePhone(emergencyText, defaultCountry) : null;
    if (emergencyText && !emergencyPhone) problems.push({ line, kind: "phone", column: "emergency_phone" });
    const vetText = get("vet_phone");
    const email = get("email");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) problems.push({ line, kind: "email", column: "email" });
    const pinText = get("pin_code").toUpperCase();
    if (pinText && !(opts.country === "IN" ? INDIA_PIN : POSTAL).test(pinText)) problems.push({ line, kind: "pin", column: "pin_code" });

    const petName = get("pet_name");
    if (!petName) problems.push({ line, kind: "petName", column: "pet_name" });
    const speciesText = get("species").toLowerCase();
    const species = speciesText ? SPECIES[speciesText] : "dog";
    if (!species) problems.push({ line, kind: "species", column: "species" });
    const sexText = get("sex").toLowerCase();
    const sex = sexText ? SEX[sexText] : "unknown";
    if (!sex) problems.push({ line, kind: "sex", column: "sex" });
    const neuteredText = get("neutered").toLowerCase();
    const isNeutered = neuteredText === "" ? null : YES.has(neuteredText) ? true : NO.has(neuteredText) ? false : undefined;
    if (isNeutered === undefined) problems.push({ line, kind: "neutered", column: "neutered" });
    const weightText = get("weight_kg").replace(",", ".");
    let weightG: number | null = null;
    if (weightText) {
      const kg = /^\d{1,3}(\.\d{1,3})?$/.test(weightText) ? Number(weightText) : NaN;
      weightG = Math.round(kg * 1000);
      if (!(weightG >= 1 && weightG <= 199999)) {
        problems.push({ line, kind: "weight", column: "weight_kg" });
        weightG = null;
      }
    }
    const dateOfBirth = date("date_of_birth");

    const vaccinations: ImportRow["vaccinations"] = [];
    for (const k of [1, 2, 3] as const) {
      const vaccine = get(`vaccine_${k}`);
      const givenOn = date(`given_on_${k}`);
      const validUntil = date(`valid_until_${k}`);
      if (!vaccine) {
        if (givenOn || validUntil) problems.push({ line, kind: "vaccine", column: `vaccine_${k}` });
        continue;
      }
      if (givenOn && validUntil && validUntil < givenOn) problems.push({ line, kind: "vaccineDates", column: `valid_until_${k}` });
      vaccinations.push({ vaccine, given_on: givenOn, valid_until: validUntil });
    }

    const petKey = `${phone}|${petName.toLowerCase()}`;
    if (phone && petName && seenPets.has(petKey)) problems.push({ line, kind: "samePet", column: "pet_name" });
    if (problems.length > 0) {
      reading.problems.push(...problems);
      reading.badLines.push({ line, cells });
      return;
    }
    seenPets.add(petKey);
    reading.rows.push({
      line,
      row: {
        parent: {
          name: parentName,
          phone: phone!,
          email: email || null,
          address: optional("address"),
          area: optional("area"),
          postal_code: pinText || null,
          city: optional("city"),
          emergency_name: optional("emergency_name"),
          emergency_phone: emergencyPhone,
          notes: optional("parent_notes"),
        },
        pet: {
          name: petName,
          species: species!,
          breed: optional("breed"),
          sex: sex!,
          is_neutered: isNeutered ?? null,
          date_of_birth: dateOfBirth,
          weight_g: weightG,
          microchip: optional("microchip"),
          food_notes: optional("food_notes"),
          medical_notes: optional("medical_notes"),
          allergies: optional("allergies"),
          behaviour_notes: optional("behaviour_notes"),
          vet_name: optional("vet_name"),
          vet_phone: vetText || null,
        },
        vaccinations,
      },
    });
  });
  return reading;
}
