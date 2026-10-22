import "server-only";
import { addDays, zonedInstant, type ISODate } from "./core";
import type { createClient } from "./supabase/server";

/**
 * Appointments as screens need them (Phase 2, D46). Kept out of the
 * "use server" files, which may export only async functions.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** The instants a kennel day runs between, for querying appointments on it. */
export function dayBounds(day: ISODate, timeZone: string): { from: string; to: string } {
  return { from: zonedInstant(day, "00:00", timeZone).toISOString(), to: zonedInstant(addDays(day, 1), "00:00", timeZone).toISOString() };
}

/** An appointment as lists and the day's board show it. The pet is named through its own key, as appointments also name a guest pet. */
export const APPOINTMENT_ROW =
  "id, kind, status, starts_at, ends_at, held_until, place_id, staff_id, booking_id, price_minor, pet_id, pets!appointments_org_id_client_id_pet_id_fkey(name), appointment_services(name)" as const;

/** The appointments that start on a kennel day, cancelled ones left out unless asked for. */
export async function appointmentsOn(supabase: Supabase, orgId: string, timeZone: string, day: ISODate, withCancelled = false) {
  const { from, to } = dayBounds(day, timeZone);
  let query = supabase.from("appointments").select(APPOINTMENT_ROW).eq("org_id", orgId).gte("starts_at", from).lt("starts_at", to);
  if (!withCancelled) query = query.neq("status", "cancelled");
  return query.order("starts_at");
}

/** The people who work here (not riders), with their skills, to choose who does an appointment. */
export async function workingPeople(supabase: Supabase, orgId: string) {
  return supabase.from("memberships").select("user_id, display_name, skills, role").eq("org_id", orgId).eq("is_active", true).neq("role", "rider").order("display_name");
}

/** Appointment states that hold the place, the pet and the person. Must match the exclusion constraints on appointments. */
export const HOLDING = ["confirmed", "done"] as const;
