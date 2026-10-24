import "server-only";
import { billFor } from "./billing";
import { owedAtCheckOut, type OwedAtCheckOut } from "./core";
import { stayBillLines } from "./stay-bill";
import type { Tables } from "./supabase/database.types";
import type { createClient } from "./supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Org = Pick<Tables<"organizations">, "id" | "tax_mode" | "gst_state_code" | "prices_include_tax" | "round_invoice_totals">;

/**
 * What a parent owes as their pet goes home (M67): the stay's bill (its
 * family's, when booked together) if it has one, or what Make bill would
 * write now, less advances no bill has taken in yet. `invoiceId` is the bill
 * to open, if any. Null when nothing can be said.
 */
export async function owedFor(
  supabase: Supabase,
  org: Org,
  b: { id: string; group_id: string | null; series_id: string | null },
): Promise<{ owed: OwedAtCheckOut; invoiceId: string | null; family: boolean } | null> {
  const family = b.group_id !== null;
  if (b.series_id) return { owed: { kind: "monthly" }, invoiceId: null, family };

  const [bill, stays] = await Promise.all([
    supabase
      .from("invoice_balances")
      .select("invoice_id, status, number, total_minor, due_minor")
      .eq("org_id", org.id)
      .eq(family ? "group_id" : "booking_id", b.group_id ?? b.id)
      .neq("status", "void")
      .maybeSingle(),
    family ? supabase.from("bookings").select("id").eq("org_id", org.id).eq("group_id", b.group_id!) : Promise.resolve({ data: [{ id: b.id }], error: null }),
  ]);
  if (bill.error || stays.error) return null;
  const live = bill.data && (bill.data.status === "draft" || bill.data.status === "issued") ? bill.data : null;
  const invoiceId = live?.invoice_id ?? null;

  let advanceMinor = 0;
  if (live?.status !== "issued") {
    const paid = await supabase
      .from("payments")
      .select("direction, amount_minor")
      .eq("org_id", org.id)
      .in("booking_id", stays.data.map((s) => s.id))
      .is("invoice_id", null);
    if (paid.error) return null;
    advanceMinor = paid.data.reduce((sum, p) => sum + (p.direction === "out" ? -p.amount_minor : p.amount_minor), 0);
  }

  let estimateMinor: number | null = null;
  if (!live) {
    const built = await stayBillLines(supabase, org.id, family ? { group: b.group_id! } : { booking: b.id });
    if (!("error" in built)) estimateMinor = built.lines.length > 0 ? billFor(org, built.lines).totalMinor : 0;
  }

  const owed = owedAtCheckOut({
    series: false,
    bill: live
      ? { status: live.status as "draft" | "issued", number: live.number, totalMinor: live.total_minor ?? 0, dueMinor: live.due_minor ?? 0 }
      : null,
    estimateMinor,
    advanceMinor,
  });
  return owed ? { owed, invoiceId, family } : null;
}
