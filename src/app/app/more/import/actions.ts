"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/auth";
import { readImport, toCsv, todayIn, type ImportReading } from "@/lib/core";
import { friendlyError } from "@/lib/errors";
import type { ImportState } from "@/lib/forms";
import { fill, plural } from "@/lib/i18n";
import { getAppI18n, type I18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";

/** A CSV of 2000 lines is well under this; anything larger is not one. */
const MAX_BYTES = 5 * 1024 * 1024;
/** Problems listed on the screen; the rest are in the download. */
const SHOWN_PROBLEMS = 30;

/** Read the file and show what would go in, saving nothing (M47). */
export async function previewImport(_state: ImportState, form: FormData): Promise<ImportState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const { m, language } = t;
  const w = m.importing;
  if (!canManage) return { error: m.errors.codes.WB002 };
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: w.noFile };
  if (file.size > MAX_BYTES) return { error: w.notCsv };
  const csv = await file.text();
  if (csv.includes("\u0000") || csv.startsWith("PK")) return { error: w.notCsv };

  const reading = readImport(csv, { country: org.country_code, today: todayIn(org.time_zone) });
  if (reading.missingColumns.length > 0) return { error: fill(w.missingColumns, { columns: reading.missingColumns.join(", ") }) };
  if (reading.rows.length === 0 && reading.problems.length === 0) return { error: w.empty };

  // What is already here: parents by phone, and their pets by name.
  const supabase = await createClient();
  const phones = [...new Set(reading.rows.map((r) => r.row.parent.phone))];
  const known = new Map<string, string>();
  for (let i = 0; i < phones.length; i += 200) {
    const { data, error } = await supabase.from("clients").select("id, phone").eq("org_id", org.id).is("deleted_at", null).in("phone", phones.slice(i, i + 200));
    if (error) return { error: friendlyError(error, t) };
    for (const c of data) known.set(c.phone, c.id);
  }
  const knownPets = new Set<string>();
  const ids = [...known.values()];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase.from("pets").select("client_id, name").eq("org_id", org.id).is("deleted_at", null).in("client_id", ids.slice(i, i + 200));
    if (error) return { error: friendlyError(error, t) };
    for (const p of data) knownPets.add(`${p.client_id}|${p.name.toLowerCase()}`);
  }

  let pets = 0;
  let skipped = 0;
  let vaccinations = 0;
  for (const { row } of reading.rows) {
    const client = known.get(row.parent.phone);
    if (client && knownPets.has(`${client}|${row.pet.name.toLowerCase()}`)) skipped += 1;
    else {
      pets += 1;
      vaccinations += row.vaccinations.length;
    }
  }
  const p = w.preview;
  const summary = [
    plural(language, phones.filter((ph) => !known.has(ph)).length, p.parents),
    ...(known.size > 0 ? [plural(language, known.size, p.known)] : []),
    plural(language, pets, p.pets),
    ...(skipped > 0 ? [plural(language, skipped, p.skipped)] : []),
    plural(language, vaccinations, p.vaccinations),
    ...(reading.badLines.length > 0 ? [plural(language, reading.badLines.length, p.problems)] : []),
  ];
  const notes = [
    ...(reading.unknownColumns.length > 0 ? [fill(w.unknownColumns, { columns: reading.unknownColumns.join(", ") })] : []),
    ...(reading.cutShort ? [fill(w.cutShort, { n: reading.rows.length + reading.badLines.length })] : []),
  ];
  const problems = reading.problems.slice(0, SHOWN_PROBLEMS).map((x) => `${fill(p.line, { line: x.line })}: ${x.column ? `${x.column}: ` : ""}${w.problems[x.kind]}`);
  const more = reading.problems.length - problems.length;
  return {
    csv,
    summary,
    good: reading.rows.length,
    problems,
    moreProblems: more > 0 ? plural(language, more, p.more) : undefined,
    notes,
    badCsv: reading.badLines.length > 0 ? badLinesCsv(reading, t) : undefined,
  };
}

/** Bring in the good lines of the file just checked, all of them or none (M47). */
export async function runImport(_state: ImportState, form: FormData): Promise<ImportState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const { m, language } = t;
  const w = m.importing;
  if (!canManage) return { error: m.errors.codes.WB002 };
  const csv = form.get("csv");
  if (typeof csv !== "string" || csv.length === 0 || csv.length > MAX_BYTES) return { error: w.noFile };
  const reading = readImport(csv, { country: org.country_code, today: todayIn(org.time_zone) });
  if (reading.rows.length === 0) return { error: w.nothingToGo };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("import_parents_and_pets", { p_org: org.id, p_rows: reading.rows.map((r) => r.row) as never });
  if (error || !data) return { error: friendlyError(error, t) };
  const done = data as { parents_added: number; pets_added: number; vaccinations_added: number };
  revalidatePath("/app/dogs");
  const p = w.preview;
  return {
    ok: fill(w.done, {
      parents: plural(language, done.parents_added, p.parents),
      pets: plural(language, done.pets_added, p.pets),
      vaccinations: plural(language, done.vaccinations_added, p.vaccinations),
    }),
  };
}

/** The lines with problems as they were, and a last column saying what is wrong. */
function badLinesCsv(reading: ImportReading, { m }: I18n): string {
  const w = m.importing;
  const why = new Map<number, string[]>();
  for (const x of reading.problems) why.set(x.line, [...(why.get(x.line) ?? []), `${x.column ? `${x.column}: ` : ""}${w.problems[x.kind]}`]);
  return toCsv(
    [...reading.header, w.problemColumn],
    reading.badLines.map((b) => [...reading.header.map((_, i) => b.cells[i] ?? ""), (why.get(b.line) ?? []).join(" ")]),
  );
}
