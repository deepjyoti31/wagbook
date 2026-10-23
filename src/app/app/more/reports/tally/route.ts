import { connection, type NextRequest } from "next/server";
import { requireOrg } from "@/lib/auth";
import { isYearMonth, monthBounds, tallyMasters, tallyVouchersXml, zipStore, type TallyBill, type TallyMethod, type TallyMonth, type TallyParty } from "@/lib/core";
import { getAppI18n } from "@/lib/i18n-server";
import { fetchAll } from "@/lib/reports";
import { createClient } from "@/lib/supabase/server";
import { tallyLedgers } from "@/lib/tally";

/**
 * A month of the books for Tally (M64, D54): a ZIP of two XML files, the
 * ledger masters to import first and the vouchers after (src/lib/core/tally.ts).
 * Issued bills by bill date (cancelled ones left out, as in Reports), credit
 * notes by their own date, payments and refunds by the day the money moved,
 * and expenses by the day spent. Owners and managers.
 */
export async function GET(request: NextRequest) {
  await connection();
  const { org, canManage } = await requireOrg();
  const { m } = await getAppI18n();
  if (!canManage) return plain(m.downloads.managersOnly, 403);
  const month = request.nextUrl.searchParams.get("month");
  if (!isYearMonth(month)) return plain(m.downloads.choosePeriod, 400);
  const { first, last } = monthBounds(month);

  const supabase = await createClient();
  const [ledgers, bills, notes, payments, expenses] = await Promise.all([
    tallyLedgers(supabase, org.id),
    fetchAll((a, b) =>
      supabase
        .from("invoices")
        .select("number, issued_on, taxable_minor, cgst_minor, sgst_minor, igst_minor, tax_minor, round_off_minor, total_minor, clients(full_name, phone)")
        .eq("org_id", org.id)
        .eq("status", "issued")
        .gte("issued_on", first)
        .lte("issued_on", last)
        .order("issued_on")
        .order("seq")
        .range(a, b),
    ),
    fetchAll((a, b) =>
      supabase
        .from("credit_notes")
        .select("number, issued_on, taxable_minor, cgst_minor, sgst_minor, igst_minor, tax_minor, round_off_minor, total_minor, invoices(number, clients(full_name, phone))")
        .eq("org_id", org.id)
        .gte("issued_on", first)
        .lte("issued_on", last)
        .order("issued_on")
        .order("seq")
        .range(a, b),
    ),
    fetchAll((a, b) =>
      supabase
        .from("payments")
        .select("received_on, direction, amount_minor, method, reference, clients(full_name, phone), invoices(number)")
        .eq("org_id", org.id)
        .gte("received_on", first)
        .lte("received_on", last)
        .order("received_on")
        .order("created_at")
        .range(a, b),
    ),
    fetchAll((a, b) =>
      supabase
        .from("expenses")
        .select("spent_on, category, vendor, description, amount_minor, method")
        .eq("org_id", org.id)
        .gte("spent_on", first)
        .lte("spent_on", last)
        .order("spent_on")
        .order("created_at")
        .range(a, b),
    ),
  ]);
  if (!ledgers || !bills || !notes || !payments || !expenses) return plain(m.downloads.failed, 500);

  const party = (c: { full_name: string; phone: string } | null | undefined): TallyParty => ({ name: c?.full_name ?? "", phone: c?.phone ?? "" });
  const amounts = (x: { taxable_minor: number; cgst_minor: number; sgst_minor: number; igst_minor: number; tax_minor: number; round_off_minor: number; total_minor: number }) => ({
    taxableMinor: x.taxable_minor,
    cgstMinor: x.cgst_minor,
    sgstMinor: x.sgst_minor,
    igstMinor: x.igst_minor,
    taxMinor: x.tax_minor,
    roundOffMinor: x.round_off_minor,
    totalMinor: x.total_minor,
  });
  const books: TallyMonth = {
    ledgers,
    bills: bills.map((b): TallyBill => ({ number: b.number ?? "", date: b.issued_on ?? first, party: party(b.clients), ...amounts(b) })),
    creditNotes: notes.map((n): TallyBill => ({ number: n.number, date: n.issued_on, party: party(n.invoices?.clients), against: n.invoices?.number ?? null, ...amounts(n) })),
    payments: payments.map((p) => ({
      date: p.received_on,
      party: party(p.clients),
      direction: p.direction === "out" ? ("out" as const) : ("in" as const),
      amountMinor: p.amount_minor,
      method: p.method as TallyMethod,
      reference: p.reference,
      bill: p.invoices?.number ?? null,
    })),
    expenses: expenses.map((e) => ({ date: e.spent_on, category: e.category, vendor: e.vendor, description: e.description, amountMinor: e.amount_minor, method: e.method as TallyMethod | null })),
  };

  const encode = (s: string) => new TextEncoder().encode(s);
  const zip = zipStore([
    { name: `1-ledgers-${month}.xml`, bytes: encode(tallyMasters(books)) },
    { name: `2-vouchers-${month}.xml`, bytes: encode(tallyVouchersXml(books)) },
  ]);
  return new Response(zip as Uint8Array<ArrayBuffer>, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="tally-${month}.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}

function plain(message: string, status: number) {
  return new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" } });
}
