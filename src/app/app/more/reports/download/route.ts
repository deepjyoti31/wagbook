import { connection, type NextRequest } from "next/server";
import { requireOrg } from "@/lib/auth";
import { INVOICE_STATUS_LABEL, PAYMENT_METHOD_LABEL } from "@/lib/billing";
import { STATUS_LABEL } from "@/lib/bookings";
import { diffDays, parseRange, toCsv, toDecimalString, type CsvValue } from "@/lib/core";
import { DOWNLOADS, fetchAll, type Download } from "@/lib/reports";
import { createClient } from "@/lib/supabase/server";

/**
 * CSV downloads for a spreadsheet or an accountant: bookings, bills, payments
 * or expenses for a period. Owners and managers only. Money is written in
 * currency units with two decimals (1250.00), dates as YYYY-MM-DD.
 */
export async function GET(request: NextRequest) {
  // Per request, always: without this the build could save a response made with no one signed in.
  await connection();
  const { org, canManage } = await requireOrg();
  if (!canManage) return plain("Downloads are for owners and managers.", 403);

  const params = request.nextUrl.searchParams;
  const what = params.get("what");
  if (!what || !(what in DOWNLOADS)) return plain("Choose what to download.", 400);
  const range = parseRange(params.get("from"), params.get("to"));
  if (!range) return plain("Choose a period of 400 days or less, with the start before the end.", 400);

  const supabase = await createClient();
  const money = (minor: number | null | undefined) => (minor === null || minor === undefined ? null : toDecimalString(minor));
  let header: string[];
  let rows: CsvValue[][] | null;

  switch (what as Download) {
    case "bookings": {
      const data = await fetchAll((a, b) =>
        supabase
          .from("bookings")
          .select("start_date, end_date, kind, status, rate_minor, discount_minor, tax_rate_bp, checked_in_at, checked_out_at, cancel_reason, created_at, pets(name), clients(full_name, phone), kennels(name)")
          .eq("org_id", org.id)
          .gte("start_date", range.from)
          .lte("start_date", range.to)
          .order("start_date")
          .order("id")
          .range(a, b),
      );
      header = ["First day", "Last day", "Kind", "Nights or days", "Status", "Pet", "Parent", "Phone", "Kennel", "Price each", "Discount", "Tax rate %", "Checked in", "Checked out", "Why cancelled", "Booked on"];
      rows =
        data?.map((r) => [
          r.start_date,
          r.end_date,
          r.kind === "daycare" ? "Day boarding" : "Boarding",
          r.kind === "daycare" ? diffDays(r.start_date, r.end_date) + 1 : diffDays(r.start_date, r.end_date),
          STATUS_LABEL[r.status],
          r.pets?.name,
          r.clients?.full_name,
          r.clients?.phone,
          r.kennels?.name,
          money(r.rate_minor),
          money(r.discount_minor),
          r.tax_rate_bp / 100,
          r.checked_in_at,
          r.checked_out_at,
          r.cancel_reason,
          r.created_at,
        ]) ?? null;
      break;
    }
    case "bills": {
      const [data, balances] = await Promise.all([
        fetchAll((a, b) =>
          supabase
            .from("invoices")
            .select("id, number, issued_on, status, buyer, place_of_supply_state_code, taxable_minor, cgst_minor, sgst_minor, igst_minor, tax_minor, round_off_minor, total_minor, void_reason, clients(full_name, phone)")
            .eq("org_id", org.id)
            .neq("status", "draft")
            .gte("issued_on", range.from)
            .lte("issued_on", range.to)
            .order("issued_on")
            .order("seq")
            .range(a, b),
        ),
        fetchAll((a, b) => supabase.from("invoice_balances").select("invoice_id, paid_minor, due_minor").eq("org_id", org.id).neq("status", "draft").order("invoice_id").range(a, b)),
      ]);
      const paid = new Map((balances ?? []).map((x) => [x.invoice_id, x]));
      header = ["Number", "Date", "Status", "Billed to", "Phone", "GSTIN", "Place of supply", "Taxed value", "CGST", "SGST", "IGST", "Tax", "Round off", "Total", "Paid", "Due", "Why cancelled"];
      rows =
        data && balances
          ? data.map((r) => {
              const buyer = (r.buyer ?? {}) as { name?: string; phone?: string; tax_id?: string | null };
              const p = paid.get(r.id);
              return [
                r.number,
                r.issued_on,
                INVOICE_STATUS_LABEL[r.status],
                buyer.name ?? r.clients?.full_name,
                buyer.phone ?? r.clients?.phone,
                buyer.tax_id,
                r.place_of_supply_state_code,
                money(r.taxable_minor),
                money(r.cgst_minor),
                money(r.sgst_minor),
                money(r.igst_minor),
                money(r.tax_minor),
                money(r.round_off_minor),
                money(r.total_minor),
                money(p?.paid_minor),
                money(p?.due_minor),
                r.void_reason,
              ];
            })
          : null;
      break;
    }
    case "payments": {
      const data = await fetchAll((a, b) =>
        supabase
          .from("payments")
          .select("received_on, direction, amount_minor, method, reference, note, clients(full_name, phone), invoices(number)")
          .eq("org_id", org.id)
          .gte("received_on", range.from)
          .lte("received_on", range.to)
          .order("received_on")
          .order("id")
          .range(a, b),
      );
      header = ["Date", "Received or refunded", "Amount", "How", "Reference", "Parent", "Phone", "Bill", "Note"];
      rows =
        data?.map((r) => [
          r.received_on,
          r.direction === "out" ? "Refunded" : "Received",
          money(r.amount_minor),
          PAYMENT_METHOD_LABEL[r.method],
          r.reference,
          r.clients?.full_name,
          r.clients?.phone,
          r.invoices?.number ?? "Advance",
          r.note,
        ]) ?? null;
      break;
    }
    case "expenses": {
      const data = await fetchAll((a, b) =>
        supabase
          .from("expenses")
          .select("spent_on, category, vendor, description, amount_minor, method, receipt_path")
          .eq("org_id", org.id)
          .gte("spent_on", range.from)
          .lte("spent_on", range.to)
          .order("spent_on")
          .order("id")
          .range(a, b),
      );
      header = ["Date", "What for", "Shop or person", "Note", "Amount", "Paid by", "Receipt kept"];
      rows =
        data?.map((r) => [r.spent_on, r.category, r.vendor, r.description, money(r.amount_minor), r.method ? PAYMENT_METHOD_LABEL[r.method] : null, Boolean(r.receipt_path)]) ??
        null;
      break;
    }
  }

  if (!rows) return plain("The download could not be made. Try again.", 500);
  return new Response(toCsv(header, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${what}-${range.from}-to-${range.to}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}

function plain(message: string, status: number) {
  return new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" } });
}
