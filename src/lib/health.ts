import "server-only";
import { healthProblems, type HealthProblem } from "./core";
import { fill } from "./i18n";
import type { Messages } from "@/messages";
import type { Tables } from "./supabase/database.types";
import type { createClient } from "./supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * What each pet will lack at the door on a day (M40), worked out in one go
 * for a list (Today's reminders) with healthProblems(), the same rule as
 * pet_health_problems() in the database. Empty while the kennel does not check.
 */
export async function petsLacking(
  supabase: Supabase,
  org: Pick<Tables<"organizations">, "id" | "health_check" | "deworm_days" | "tick_days" | "neuter_months">,
  stays: readonly { petId: string; on: string }[],
): Promise<Map<string, HealthProblem[]>> {
  const out = new Map<string, HealthProblem[]>();
  if (org.health_check === "off" || stays.length === 0) return out;
  const ids = [...new Set(stays.map((s) => s.petId))];
  const [required, pets, vaccinations] = await Promise.all([
    supabase.from("required_vaccines").select("vaccine, months_valid").eq("org_id", org.id),
    supabase.from("pets").select("id, date_of_birth, is_neutered, dewormed_on, tick_treated_on").eq("org_id", org.id).in("id", ids),
    supabase.from("vaccinations").select("pet_id, vaccine, given_on, valid_until").eq("org_id", org.id).in("pet_id", ids),
  ]);
  const rules = { required: required.data ?? [], deworm_days: org.deworm_days, tick_days: org.tick_days, neuter_months: org.neuter_months };
  for (const s of stays) {
    const pet = (pets.data ?? []).find((p) => p.id === s.petId);
    if (!pet) continue;
    const problems = healthProblems({ ...pet, vaccinations: (vaccinations.data ?? []).filter((v) => v.pet_id === pet.id) }, rules, s.on);
    if (problems.length > 0) out.set(`${s.petId}:${s.on}`, problems);
  }
  return out;
}

/** A pet's problems in words: "rabies vaccination, deworming". */
export function lacksInWords(problems: readonly HealthProblem[], w: Messages["health"]["problems"]): string[] {
  return problems.map((p) => (p.problem === "vaccine" ? fill(w.vaccine, { vaccine: p.vaccine }) : w[p.problem]));
}
