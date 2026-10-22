import type { PGlite } from "@electric-sql/pglite";
import { creditPayload, differenceCredit, moneyLines, type CreditableBill, type MoneyLine } from "../../src/lib/billing";
import type { Kennel } from "./fixtures";
import { foodBill, q } from "./kitchen-fixtures";

/**
 * Credit a subscription's bill for the period starting `from` down to what its
 * deliveries now come to, as the bill page does (differenceCredit), and return
 * what the credit note took off.
 */
export async function creditForChangeLines(db: PGlite, actor: string, k: Kennel, subscription: string, from: string): Promise<number> {
  const [bill] = await q<CreditableBill & { id: string; period_end: string }>(
    db, actor,
    "select id, period_end::text, is_tax_invoice, prices_include_tax, place_of_supply_state_code, seller from public.invoices where subscription_id = $1 and period_start = $2 and status = 'issued'",
    [subscription, from],
  );
  const billed = await q<MoneyLine>(db, actor, "select tax_rate_bp, taxable_minor::int, total_minor::int, sac_code from public.invoice_lines where invoice_id = $1", [bill.id]);
  const now = await foodBill(db, actor, k, { subscription, from, to: bill.period_end });
  const credit = differenceCredit(bill, billed, [], moneyLines(now), "Deliveries cancelled", true);
  if (!credit) return 0;
  const { p_totals, p_lines } = creditPayload(credit);
  await q(db, actor, "select public.issue_credit_note($1, 'Deliveries cancelled', $2, $3)", [bill.id, JSON.stringify(p_totals), JSON.stringify(p_lines)]);
  return credit.totalMinor;
}
