import { connection, type NextRequest } from "next/server";
import { requireOrg } from "@/lib/auth";
import { GSTR1_PARTS, gstr1Sheet, isYearMonth, monthBounds, toCsv, type Gstr1Bill, type Gstr1Line, type Gstr1Note, type Gstr1Part } from "@/lib/core";
import { getAppI18n } from "@/lib/i18n-server";
import { fetchAll } from "@/lib/reports";
import { createClient } from "@/lib/supabase/server";

/**
 * One sheet of GSTR-1 for a month, as a CSV file for the GST offline tool
 * (src/lib/core/gstr1.ts, D38). Owners and managers of a GST-registered
 * kennel. The column names are the tool's own, in English, because the tool
 * matches them exactly; and the file carries no byte order mark, for the same
 * reason.
 */
export async function GET(request: NextRequest) {
  await connection();
  const { org, canManage } = await requireOrg();
  const { m } = await getAppI18n();
  if (!canManage) return plain(m.downloads.managersOnly, 403);
  if (org.tax_mode !== "gst_india") return plain(m.reports.gstr1.gstOnly, 400);
  const params = request.nextUrl.searchParams;
  const month = params.get("month");
  const part = params.get("part") as Gstr1Part | null;
  if (!isYearMonth(month) || !part || !GSTR1_PARTS.includes(part)) return plain(m.downloads.choosePeriod, 400);
  const { first, last } = monthBounds(month);

  const supabase = await createClient();
  const [bills, notes] = await Promise.all([
    fetchAll((a, b) =>
      supabase
        .from("invoices")
        .select("number, issued_on, status, buyer, seller, place_of_supply_state_code, total_minor, invoice_lines(tax_rate_bp, sac_code, taxable_minor, igst_minor, cgst_minor, sgst_minor)")
        .eq("org_id", org.id)
        .eq("is_tax_invoice", true)
        .neq("status", "draft")
        .gte("issued_on", first)
        .lte("issued_on", last)
        .order("seq")
        .range(a, b),
    ),
    fetchAll((a, b) =>
      supabase
        .from("credit_notes")
        .select("number, issued_on, total_minor, credit_note_lines(tax_rate_bp, sac_code, taxable_minor, igst_minor, cgst_minor, sgst_minor), invoices(number, issued_on, buyer, seller, place_of_supply_state_code, total_minor, is_tax_invoice)")
        .eq("org_id", org.id)
        .gte("issued_on", first)
        .lte("issued_on", last)
        .order("seq")
        .range(a, b),
    ),
  ]);
  if (!bills || !notes) return plain(m.downloads.failed, 500);

  type Row = { tax_rate_bp: number; sac_code: string | null; taxable_minor: number; igst_minor: number; cgst_minor: number; sgst_minor: number };
  const lines = (rows: Row[]): Gstr1Line[] =>
    rows.map((l) => ({ taxRateBp: l.tax_rate_bp, sacCode: l.sac_code, taxableMinor: l.taxable_minor, igstMinor: l.igst_minor, cgstMinor: l.cgst_minor, sgstMinor: l.sgst_minor }));
  const party = (i: { buyer: unknown; seller: unknown; place_of_supply_state_code: string | null; total_minor: number; number: string | null }) => {
    const buyer = (i.buyer ?? {}) as { name?: string; tax_id?: string | null };
    const seller = (i.seller ?? {}) as { gst_state_code?: string | null };
    const sellerState = seller.gst_state_code ?? org.gst_state_code ?? "";
    return { number: i.number ?? "", buyerName: buyer.name ?? "", buyerGstin: buyer.tax_id || null, placeOfSupply: i.place_of_supply_state_code ?? sellerState, sellerState, totalMinor: i.total_minor };
  };
  const gBills: Gstr1Bill[] = bills.map((i) => ({ ...party(i), date: i.issued_on ?? first, cancelled: i.status === "void", lines: lines(i.invoice_lines) }));
  const gNotes: Gstr1Note[] = notes
    .filter((n) => n.invoices?.is_tax_invoice)
    .map((n) => ({
      number: n.number,
      date: n.issued_on,
      totalMinor: n.total_minor,
      lines: lines(n.credit_note_lines),
      bill: { ...party(n.invoices!), date: n.invoices?.issued_on ?? n.issued_on },
    }));

  const sheet = gstr1Sheet(part, gBills, gNotes);
  return new Response(toCsv(sheet.header, sheet.rows, { byteOrderMark: false }), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${part}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}

function plain(message: string, status: number) {
  return new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" } });
}
