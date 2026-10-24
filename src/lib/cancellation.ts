import "server-only";
import {
  cancellationOutcome,
  cancelledStayMoney,
  DEFAULT_CANCEL_RULE,
  holidayDates,
  stayUnits,
  stillToSettle,
  toStayCharges,
  type CancelRule,
  type CancelResult,
} from "./core";
import type { Tables } from "./supabase/database.types";
import type { createClient } from "./supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * The night-by-night outcome of a cancelled stay (M38), worked out the same
 * way for the stay's page and for the action that confirms it, from the
 * database as it is now: the kennel's rule for the kind of stay, its weekend
 * days and holidays, what each night is worth, and the advance paid. Also
 * what is still to give back, less what was given back since the stay was
 * cancelled, and what that was.
 */
export async function cancelledStayOutcome(
  supabase: Supabase,
  org: Pick<Tables<"organizations">, "id" | "time_zone" | "check_in_time" | "weekend_days">,
  bookingId: string,
  choice: "refund" | "credit" | null = null,
): Promise<{ result: CancelResult; toSettle: { refundMinor: number; creditMinor: number }; givenMinor: number; byKennel: boolean; clientId: string } | null> {
  const b = await supabase
    .from("bookings")
    .select("id, client_id, kind, status, start_date, end_date, boarding_from, discount_minor, pass_id, cancel_asked_at, cancelled_at, cancelled_by_kennel")
    .eq("org_id", org.id)
    .eq("id", bookingId)
    .maybeSingle();
  if (!b.data || b.data.status !== "cancelled") return null;
  const [rule, peaks, charges, paid] = await Promise.all([
    supabase.from("cancellation_rules").select("notice_hours, weekday_on_time, weekday_late, weekend_on_time, weekend_late").eq("org_id", org.id).eq("applies_to", b.data.kind).maybeSingle(),
    supabase.from("peak_periods").select("start_date, end_date, is_holiday").eq("org_id", org.id).eq("is_holiday", true).lte("start_date", b.data.end_date).gte("end_date", b.data.start_date),
    supabase.rpc("stay_charges", { p_org: org.id, p_bookings: [b.data.id] }),
    supabase.from("payments").select("direction, amount_minor, method, created_at").eq("org_id", org.id).eq("booking_id", b.data.id).is("invoice_id", null),
  ]);
  if (charges.error || peaks.error || paid.error) return null;
  const { paidMinor, given } = cancelledStayMoney(paid.data ?? [], b.data.cancelled_at);
  const result = cancellationOutcome({
    units: stayUnits(b.data, toStayCharges(charges.data)),
    askedAt: new Date(b.data.cancel_asked_at ?? b.data.cancelled_at ?? Date.now()),
    checkInTime: org.check_in_time,
    timeZone: org.time_zone,
    rule: (rule.data as CancelRule | null) ?? DEFAULT_CANCEL_RULE,
    weekendDays: org.weekend_days,
    holidays: holidayDates(peaks.data ?? []),
    byKennel: b.data.cancelled_by_kennel ? (choice ?? "refund") : null,
    paidMinor,
  });
  return {
    result,
    toSettle: stillToSettle(result, given),
    givenMinor: given.refundMinor + given.creditMinor,
    byKennel: b.data.cancelled_by_kennel,
    clientId: b.data.client_id,
  };
}
