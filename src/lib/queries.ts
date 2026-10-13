import "server-only";
import type { QueryData } from "@supabase/supabase-js";
import type { createClient } from "./supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * Shared read queries.
 *
 * RULE: every query filters by org_id explicitly. Row level security already
 * stops other organisations' rows from being returned, but a person can
 * belong to more than one organisation, and without the filter they would see
 * all of theirs mixed together.
 */

// One string literal, not pieces joined with +, so that the Supabase client can work out the row type from it.
const BOOKING_CARD =
  "id, kind, status, start_date, end_date, kennel_id, public_token, rate_minor, notes, pets(id, name, breed, species, flags), clients(id, full_name, phone), kennels(id, name)" as const;

export function bookingCards(supabase: Client, orgId: string) {
  return supabase.from("bookings").select(BOOKING_CARD).eq("org_id", orgId);
}

export type BookingCard = QueryData<ReturnType<typeof bookingCards>>[number];
