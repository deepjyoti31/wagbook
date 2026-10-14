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
  "id, kind, status, start_date, end_date, kennel_id, public_token, rate_minor, notes, group_id, pets(id, name, breed, species, flags, photo_path), clients(id, full_name, phone), kennels(id, name)" as const;

export function bookingCards(supabase: Client, orgId: string) {
  return supabase.from("bookings").select(BOOKING_CARD).eq("org_id", orgId);
}

export type BookingCard = QueryData<ReturnType<typeof bookingCards>>[number];

/** Peak periods overlapping a range of dates, for badges and warnings. */
export function peakPeriods(supabase: Client, orgId: string, from: string, to: string) {
  return supabase
    .from("peak_periods")
    .select("id, name, start_date, end_date, no_refund, play_session_minutes")
    .eq("org_id", orgId)
    .lte("start_date", to)
    .gte("end_date", from)
    .order("start_date");
}

export type PeakRow = QueryData<ReturnType<typeof peakPeriods>>[number];

/** A peak period row in the shape the core rules use. */
export function toPeak(p: PeakRow) {
  return { name: p.name, startDate: p.start_date, endDate: p.end_date, noRefund: p.no_refund, playSessionMinutes: p.play_session_minutes };
}
