import type { ReactNode } from "react";
import { taxLabel as taxName } from "@/lib/billing";
import { amountInWords, formatMoney } from "@/lib/core";
import { fill } from "@/lib/i18n";
import type { Messages } from "@/messages";

/**
 * A bill's lines and totals, the same for staff and for the parent's page.
 * Server-safe (no hooks). Built to print on A4 as well as read on a phone:
 * lines are rows with the money on the right, not a wide table.
 * `words` is the reader's messages (m), for m.invoice and the name of the
 * tax. The amount in words stays in English: it is the bill's legal line.
 */

export interface InvoiceLineView {
  description: string;
  sacCode: string | null;
  quantity: number;
  unitPriceMinor: number;
  discountMinor: number;
  taxableMinor: number;
  taxRateBp: number;
  cgstMinor: number;
  sgstMinor: number;
  igstMinor: number;
  taxMinor: number;
  totalMinor: number;
}

export interface InvoiceTotalsView {
  subtotalMinor: number;
  discountMinor: number;
  taxableMinor: number;
  cgstMinor: number;
  sgstMinor: number;
  igstMinor: number;
  taxMinor: number;
  roundOffMinor: number;
  totalMinor: number;
}

export function InvoiceView({
  lines,
  totals,
  currency,
  locale = "en-IN",
  taxMode,
  taxLabel,
  showTax,
  lineActions,
  words,
}: {
  lines: InvoiceLineView[];
  totals: InvoiceTotalsView;
  currency: string;
  locale?: string;
  taxMode: string;
  taxLabel?: string | null;
  /** Show the tax breakup. True on a tax invoice. */
  showTax: boolean;
  /** Something to put under a line, such as a form to change it. */
  lineActions?: (index: number) => ReactNode;
  /** The reader's messages (m). */
  words: Messages;
}) {
  const w = words.invoice;
  const money = (minor: number) => formatMoney(minor, { currency, locale });
  const pct = (bp: number) => `${bp / 100}%`;
  const gst = taxMode === "gst_india";
  const name = taxName(words, taxMode, taxLabel);
  // What a line is made of: "2 x ₹1,200, less ₹200. SAC 998599. CGST 9% ₹90, SGST 9% ₹90".
  const lineText = (l: InvoiceLineView) =>
    [
      fill(l.discountMinor > 0 ? w.quantityPriceLess : w.quantityPrice, { quantity: l.quantity, price: money(l.unitPriceMinor), discount: money(l.discountMinor) }),
      l.sacCode ? fill(w.sac, { code: l.sacCode }) : null,
      showTax && l.taxRateBp > 0
        ? gst
          ? l.igstMinor > 0
            ? fill(w.igstLine, { rate: pct(l.taxRateBp), amount: money(l.igstMinor) })
            : fill(w.cgstSgstLine, { rate: pct(l.taxRateBp / 2), cgst: money(l.cgstMinor), sgst: money(l.sgstMinor) })
          : fill(w.taxLine, { tax: name, rate: pct(l.taxRateBp), amount: money(l.taxMinor) })
        : null,
    ]
      .filter(Boolean)
      .join(". ");

  return (
    <div className="invoice">
      {/* The lines, numbered, under a ruled heading: what, and the amount at the right. */}
      <div className="flex gap-4 border-b border-ink px-2.5 pb-2 text-[13px] font-[650] text-slate">
        <span className="w-6 shrink-0">{w.lineNumber}</span>
        <span className="flex-1">{w.what}</span>
        <span>{w.amount}</span>
      </div>
      <ul className="divide-y divide-rule-strong border-b border-rule-strong">
        {lines.map((l, i) => (
          <li key={i} className="px-2.5 py-3">
            <div className="flex items-start gap-4">
              <span className="w-6 shrink-0 tabular-nums">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="font-bold">{l.description}</p>
                <p className="mt-0.5 text-[13px] text-slate">{lineText(l)}</p>
              </div>
              <p className="tabular-nums">{money(l.totalMinor)}</p>
            </div>
            {lineActions ? <div className="pl-10">{lineActions(i)}</div> : null}
          </li>
        ))}
      </ul>

      <dl className="ml-auto mt-5 max-w-[280px] space-y-2 text-[15px] tabular-nums">
        {totals.discountMinor > 0 || showTax ? <Row label={w.beforeDiscount} value={money(totals.subtotalMinor)} /> : null}
        {totals.discountMinor > 0 ? <Row label={w.discount} value={`- ${money(totals.discountMinor)}`} /> : null}
        {showTax ? <Row label={w.taxableValue} value={money(totals.taxableMinor)} /> : null}
        {showTax && gst && totals.cgstMinor > 0 ? <Row label={w.cgst} value={money(totals.cgstMinor)} /> : null}
        {showTax && gst && totals.sgstMinor > 0 ? <Row label={w.sgst} value={money(totals.sgstMinor)} /> : null}
        {showTax && gst && totals.igstMinor > 0 ? <Row label={w.igst} value={money(totals.igstMinor)} /> : null}
        {showTax && !gst && totals.taxMinor > 0 ? <Row label={name} value={money(totals.taxMinor)} /> : null}
        {totals.roundOffMinor !== 0 ? <Row label={w.roundOff} value={money(totals.roundOffMinor)} /> : null}
        <div className="flex justify-between gap-4 border-t border-ink pt-2.5 text-lg font-extrabold">
          <dt>{w.total}</dt>
          <dd>{money(totals.totalMinor)}</dd>
        </div>
        {currency === "INR" ? <p className="text-[13px] text-slate">{amountInWords(totals.totalMinor)}</p> : null}
      </dl>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
