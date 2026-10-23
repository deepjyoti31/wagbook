/**
 * Selling over the counter and ordering from suppliers (M62, M63): what a
 * sale puts on a bill, the quantities typed on the counter's form, and what
 * to reorder. Pieces and paise, never decimals.
 */

import { isLow } from "./food";
import type { LineInput } from "./tax";

/** A line of a sale as the database keeps it (sale_lines). */
export interface SoldLine {
  description: string;
  quantity: number;
  unit_price_minor: number;
  tax_rate_bp: number;
  hsn_code: string | null;
}

/**
 * The bill lines for things sold: each at the price, tax rate and code it was
 * sold at, with no discount. The same on a stay's bill and on a bill of its
 * own. Must match sale_bill_lines() and the sale lines in
 * invoice_expected_lines() in the database.
 */
export function saleLines(lines: readonly SoldLine[]): LineInput[] {
  return lines.map((l) => ({
    description: l.description,
    quantity: l.quantity,
    unitPriceMinor: l.unit_price_minor,
    discountMinor: 0,
    taxRateBp: l.tax_rate_bp,
    sacCode: l.hsn_code,
  }));
}

/** What a sale comes to before tax: pieces times price, added up. */
export function saleSubtotal(lines: readonly { quantity: number; unit_price_minor: number }[]): number {
  return lines.reduce((sum, l) => sum + l.quantity * l.unit_price_minor, 0);
}

/** The most pieces of one thing sold at a time. */
export const MAX_PIECES = 1000;

/**
 * The quantities typed on the counter's form, one field per item named
 * `qty-{item id}`: only items in `known`, empty or 0 left out. Null when a
 * quantity is not a whole number from 0 to MAX_PIECES, so the form can say so.
 */
export function quantitiesFrom(entries: Iterable<[string, unknown]>, known: ReadonlySet<string>): { item_id: string; quantity: number }[] | null {
  const out: { item_id: string; quantity: number }[] = [];
  for (const [key, value] of entries) {
    if (!key.startsWith("qty-")) continue;
    const id = key.slice(4);
    if (!known.has(id)) continue;
    const typed = typeof value === "string" ? value.trim() : "";
    if (typed === "") continue;
    if (!/^\d{1,4}$/.test(typed)) return null;
    const n = Number(typed);
    if (n > MAX_PIECES) return null;
    if (n > 0) out.push({ item_id: id, quantity: n });
  }
  return out;
}

export interface ReorderLine {
  item_id: string;
  name: string;
  on_hand: number;
  low_level: number;
  on_order: number;
  /** True when what is on order brings it back above its low level. */
  coming: boolean;
}

/**
 * What to reorder: each item at or below its low level, by name, with what
 * is already on order. One whose order will bring it back above its level is
 * marked as coming, so nobody orders it twice.
 */
export function reorderList(
  items: readonly { item_id: string; name: string; on_hand: number; low_level: number | null; is_active?: boolean }[],
  onOrder: ReadonlyMap<string, number>,
): ReorderLine[] {
  return items
    .filter((i) => i.is_active !== false && isLow(i.on_hand, i.low_level))
    .map((i) => {
      const ordered = onOrder.get(i.item_id) ?? 0;
      return { item_id: i.item_id, name: i.name, on_hand: i.on_hand, low_level: i.low_level!, on_order: ordered, coming: i.on_hand + ordered > i.low_level! };
    })
    .sort((a, b) => Number(a.coming) - Number(b.coming) || a.name.localeCompare(b.name));
}

/** Each line of an order to a supplier: still to come is what was ordered less what came, never below nothing. */
export function stillToCome(ordered: number, received: number): number {
  return Math.max(ordered - received, 0);
}

/**
 * A quantity as a person would type it back into a form, without digit
 * grouping, so parseQuantity() reads it again: 2500 g is "2.5 kg", 750 g is
 * "750 g", 1500 pieces is "1500".
 */
export function typedQuantity(n: number, unit: "g" | "ml" | "piece"): string {
  if (unit === "piece") return String(n);
  const [small, big] = unit === "g" ? ["g", "kg"] : ["ml", "l"];
  return n >= 1000 ? `${n / 1000} ${big}` : `${n} ${small}`;
}
