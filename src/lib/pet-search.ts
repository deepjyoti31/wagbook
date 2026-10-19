import "server-only";
import { petMatches } from "./core/bookings";
import type { createClient } from "./supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

/** A pet as New booking's picker needs it. Must match PickablePet in src/components/family-picker.tsx. */
export interface PetChoice {
  id: string;
  name: string;
  breed: string | null;
  clientId: string;
  parentName: string | null;
  parentPhone: string | null;
}

/** How many pets one search brings back, before their brothers and sisters are added. */
export const PET_SEARCH_LIMIT = 30;

const PET = "id, name, breed, client_id, clients(full_name, phone)" as const;

/** The pets of these parents that are not hidden, so a family can be ticked together. */
async function petsOf(supabase: Client, orgId: string, clientIds: string[]): Promise<PetChoice[]> {
  if (clientIds.length === 0) return [];
  const { data, error } = await supabase.from("pets").select(PET).eq("org_id", orgId).in("client_id", clientIds).is("deleted_at", null).order("name").limit(500);
  if (error) throw new Error("Could not load pets.");
  return data.map((p) => ({ id: p.id, name: p.name, breed: p.breed, clientId: p.client_id, parentName: p.clients?.full_name ?? null, parentPhone: p.clients?.phone ?? null }));
}

/** `%` and `_` typed by a person are letters, not patterns. */
function likeText(text: string): string {
  return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * Pets matching what was typed, with every other pet of their parents (for
 * booking a family together). The database narrows by the first word, or by
 * the digits of a phone number; petMatches() then applies the same rule the
 * picker uses, so the server and the screen agree.
 */
export async function searchPets(supabase: Client, orgId: string, query: string): Promise<PetChoice[]> {
  const q = query.trim().slice(0, 100);
  if (q === "") return [];
  const digits = q.replace(/[^0-9]/g, "");
  const byPhone = digits.length >= 3 && /^[0-9+\s()-]+$/.test(q);
  const first = likeText(q.split(/\s+/)[0]);

  const parents = byPhone
    ? supabase.from("clients").select("id").eq("org_id", orgId).is("deleted_at", null).like("phone", likeText(digits)).limit(PET_SEARCH_LIMIT)
    : supabase.from("clients").select("id").eq("org_id", orgId).is("deleted_at", null).ilike("full_name", first).limit(PET_SEARCH_LIMIT);
  const [byParent, byName, byBreed] = await Promise.all([
    parents,
    byPhone ? Promise.resolve({ data: [], error: null }) : supabase.from("pets").select("client_id").eq("org_id", orgId).is("deleted_at", null).ilike("name", first).limit(PET_SEARCH_LIMIT),
    byPhone ? Promise.resolve({ data: [], error: null }) : supabase.from("pets").select("client_id").eq("org_id", orgId).is("deleted_at", null).ilike("breed", first).limit(PET_SEARCH_LIMIT),
  ]);
  if (byParent.error || byName.error || byBreed.error) throw new Error("Could not search pets.");

  const clientIds = [...new Set([...byParent.data.map((c) => c.id), ...byName.data.map((p) => p.client_id), ...byBreed.data.map((p) => p.client_id)])];
  const family = await petsOf(supabase, orgId, clientIds);
  const matched = new Set(family.filter((p) => petMatches(p, q)).slice(0, PET_SEARCH_LIMIT).map((p) => p.clientId));
  return family.filter((p) => matched.has(p.clientId));
}

/**
 * The pets New booking offers before anything is typed: the pet asked for (with
 * its family), then those booked most recently and those added most recently,
 * each with their families.
 */
export async function startingPets(supabase: Client, orgId: string, petId?: string): Promise<PetChoice[]> {
  const [asked, booked, added] = await Promise.all([
    petId ? supabase.from("pets").select("client_id").eq("org_id", orgId).eq("id", petId).is("deleted_at", null).maybeSingle() : Promise.resolve({ data: null, error: null }),
    supabase.from("bookings").select("client_id").eq("org_id", orgId).order("created_at", { ascending: false }).limit(60),
    supabase.from("pets").select("client_id").eq("org_id", orgId).is("deleted_at", null).order("created_at", { ascending: false }).limit(20),
  ]);
  if (asked.error || booked.error || added.error) throw new Error("Could not load pets.");
  const clientIds = [...new Set([...(asked.data ? [asked.data.client_id] : []), ...booked.data.map((b) => b.client_id), ...added.data.map((p) => p.client_id)])].slice(0, PET_SEARCH_LIMIT);
  return petsOf(supabase, orgId, clientIds);
}

/** Does the kennel have any pet at all (not hidden)? */
export async function hasPets(supabase: Client, orgId: string): Promise<boolean> {
  const { count, error } = await supabase.from("pets").select("id", { count: "exact", head: true }).eq("org_id", orgId).is("deleted_at", null);
  if (error) throw new Error("Could not load pets.");
  return (count ?? 0) > 0;
}
