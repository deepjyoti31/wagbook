import { connection, type NextRequest } from "next/server";
import { requireOrg } from "@/lib/auth";
import { parseRange, toCsv, toDecimalString } from "@/lib/core";
import { getAppI18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";

/**
 * Food reports as CSV (M33): month by month, or deliveries by rider by day,
 * for a period. Owners and managers only; the database refuses anyone else
 * too (WB060). Column names are the report's own words in the reader's
 * language; money in currency units with two decimals.
 */
export async function GET(request: NextRequest) {
  await connection();
  const { org, canManage } = await requireOrg();
  const { m } = await getAppI18n();
  const words = m.downloads;
  const f = m.foodReports;
  if (!canManage) return plain(words.managersOnly, 403);
  const params = request.nextUrl.searchParams;
  const range = parseRange(params.get("from"), params.get("to"));
  if (!range) return plain(words.choosePeriod, 400);
  const what = params.get("what") === "riders" ? "riders" : "months";
  const supabase = await createClient();
  const args = { p_org: org.id, p_from: range.from, p_to: range.to };
  const money = (minor: number) => toDecimalString(minor);

  let csv: string;
  if (what === "riders") {
    const { data, error } = await supabase.rpc("report_food_riders", args);
    if (error) return plain(words.failed, 500);
    csv = toCsv(
      [m.downloads.columns.date, m.runs.rider, m.deliveryStatus.delivered, m.deliveryStatus.not_home, m.deliveryStatus.refused],
      data.map((r) => [r.day, r.rider_name, r.delivered, r.not_home, r.refused]),
    );
  } else {
    const { data, error } = await supabase.rpc("report_food", args);
    if (error) return plain(words.failed, 500);
    csv = toCsv(
      [f.month, f.active, f.started, f.ended, f.trials, f.trialsSubscribed, f.deliveries, f.kgDelivered, f.value, f.kgCooked, f.cost, f.wasted, f.wastedCost],
      data.map((r) => [
        r.month.slice(0, 7),
        r.active_subscriptions,
        r.subscriptions_started,
        r.subscriptions_ended,
        r.trials,
        r.trials_subscribed,
        r.deliveries,
        Number(r.kilos_delivered),
        money(r.food_value_minor),
        Number(r.kilos_cooked),
        money(r.cooking_cost_minor),
        r.wasted_g,
        money(r.wasted_cost_minor),
      ]),
    );
  }
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="food-${what}-${range.from}-to-${range.to}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}

function plain(message: string, status: number) {
  return new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" } });
}
