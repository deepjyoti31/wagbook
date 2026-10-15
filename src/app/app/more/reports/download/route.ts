import { connection, type NextRequest } from "next/server";
import { requireOrg } from "@/lib/auth";
import { diffDays, parseRange, toCsv, toDecimalString, type CsvValue } from "@/lib/core";
import { getAppI18n } from "@/lib/i18n-server";
import { fetchAll, isDownload } from "@/lib/reports";
import { createClient } from "@/lib/supabase/server";

/**
 * CSV downloads for a spreadsheet or an accountant: bookings, bills, payments
 * or expenses for a period. Owners and managers only. Money is written in
 * currency units with two decimals (1250.00), dates as YYYY-MM-DD. Column
 * names and words such as "Received" are in the reader's language
 * (m.downloads); what people typed (a category, a note) is as they typed it.
 */
export async function GET(request: NextRequest) {
  // Per request, always: without this the build could save a response made with no one signed in.
  await connection();
  const { org, canManage } = await requireOrg();
  const { m } = await getAppI18n();
  const words = m.downloads;
  const c = words.columns;
  const v = words.values;
  if (!canManage) return plain(words.managersOnly, 403);

  const params = request.nextUrl.searchParams;
  const what = params.get("what");
  if (!isDownload(what)) return plain(words.chooseWhat, 400);
  const range = parseRange(params.get("from"), params.get("to"));
  if (!range) return plain(words.choosePeriod, 400);

  const supabase = await createClient();
  const money = (minor: number | null | undefined) => (minor === null || minor === undefined ? null : toDecimalString(minor));
  let header: string[];
  let rows: CsvValue[][] | null;

  switch (what) {
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
      header = [
        c.firstDay,
        c.lastDay,
        c.kind,
        c.nightsOrDays,
        c.status,
        c.pet,
        c.parent,
        c.phone,
        c.kennel,
        c.priceEach,
        c.discount,
        c.taxRate,
        c.checkedIn,
        c.checkedOut,
        c.whyCancelled,
        c.bookedOn,
      ];
      rows =
        data?.map((r) => [
          r.start_date,
          r.end_date,
          m.labels.bookingKind[r.kind],
          r.kind === "daycare" ? diffDays(r.start_date, r.end_date) + 1 : diffDays(r.start_date, r.end_date),
          m.labels.bookingStatus[r.status],
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
      header = [
        c.number,
        c.date,
        c.status,
        c.billedTo,
        c.phone,
        c.gstin,
        c.placeOfSupply,
        c.taxedValue,
        c.cgst,
        c.sgst,
        c.igst,
        c.tax,
        c.roundOff,
        c.total,
        c.paid,
        c.due,
        c.whyCancelled,
      ];
      rows =
        data && balances
          ? data.map((r) => {
              const buyer = (r.buyer ?? {}) as { name?: string; phone?: string; tax_id?: string | null };
              const p = paid.get(r.id);
              return [
                r.number,
                r.issued_on,
                m.labels.invoiceStatus[r.status],
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
      header = [c.date, c.receivedOrRefunded, c.amount, c.how, c.reference, c.parent, c.phone, c.bill, c.note];
      rows =
        data?.map((r) => [
          r.received_on,
          r.direction === "out" ? v.refunded : v.received,
          money(r.amount_minor),
          m.labels.paymentMethod[r.method],
          r.reference,
          r.clients?.full_name,
          r.clients?.phone,
          r.invoices?.number ?? v.advance,
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
      header = [c.date, c.whatFor, c.shopOrPerson, c.note, c.amount, c.paidBy, c.receiptKept];
      rows =
        data?.map((r) => [
          r.spent_on,
          r.category,
          r.vendor,
          r.description,
          money(r.amount_minor),
          r.method ? m.labels.paymentMethod[r.method] : null,
          r.receipt_path ? v.yes : v.no,
        ]) ?? null;
      break;
    }
  }

  if (!rows) return plain(words.failed, 500);
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
