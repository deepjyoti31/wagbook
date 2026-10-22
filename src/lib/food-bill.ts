import { roundHalfUp, type LineInput } from "./core";

/**
 * The lines of a food bill (M29): a subscription's deliveries in a week or a
 * month, or one order. Grouped exactly as food_bill_lines() in the database
 * groups them (food by price, tax rate and code, in kilos; each trial; each
 * item; delivery charges by amount), so staff can issue it. Stored with the
 * bill, so in English like the rest of its lines.
 */

export interface BillableDelivery {
  kind: "subscription" | "trial" | "order" | "item" | "replacement";
  status: string;
  delivery_date: string;
  grams: number;
  quantity: number;
  unit_price_minor: number;
  delivery_charge_minor: number;
  tax_rate_bp: number;
  sac_code: string | null;
  /** The food's name in the rate card, for trials and items. */
  product_name?: string | null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (d: string) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;
const kg = (grams: number) => String(grams / 1000);

/** The deliveries a food bill counts: not cancelled, and not replacements, which cost nothing. Must match food_bill_lines(). */
export function billableDeliveries<D extends BillableDelivery>(deliveries: readonly D[]): D[] {
  return deliveries.filter((d) => d.status !== "cancelled" && d.kind !== "replacement");
}

export function foodLines(petName: string, deliveries: readonly BillableDelivery[], monthlyDiscountBp = 0): LineInput[] {
  const billable = [...billableDeliveries(deliveries)].sort((a, b) => a.delivery_date.localeCompare(b.delivery_date));
  const food = new Map<string, { grams: number; dates: string[]; d: BillableDelivery }>();
  for (const d of billable.filter((x) => x.kind === "subscription" || x.kind === "order")) {
    const key = `${d.unit_price_minor}|${d.tax_rate_bp}|${d.sac_code ?? ""}`;
    const g = food.get(key) ?? { grams: 0, dates: [], d };
    g.grams += d.grams;
    g.dates.push(d.delivery_date);
    food.set(key, g);
  }
  const lines: LineInput[] = [...food.values()].map(({ grams, dates, d }) => {
    const quantity = grams / 1000;
    const n = dates.length;
    return {
      description: `Fresh food for ${petName}: ${kg(grams)} kg, ${n} ${n === 1 ? "delivery" : "deliveries"} (${dates.map(day).join(", ")})`.slice(0, 300),
      quantity,
      unitPriceMinor: d.unit_price_minor,
      discountMinor: roundHalfUp((roundHalfUp(quantity * d.unit_price_minor) * monthlyDiscountBp) / 10_000),
      taxRateBp: d.tax_rate_bp,
      sacCode: d.sac_code,
    };
  });
  for (const d of billable.filter((x) => x.kind === "trial")) {
    lines.push({
      description: `${d.product_name ?? "Food trial"} for ${petName}: ${kg(d.grams)} kg (${day(d.delivery_date)})`.slice(0, 300),
      quantity: 1,
      unitPriceMinor: d.unit_price_minor,
      taxRateBp: d.tax_rate_bp,
      sacCode: d.sac_code,
    });
  }
  for (const d of billable.filter((x) => x.kind === "item")) {
    lines.push({
      description: `${d.product_name ?? "Item"} for ${petName} (${day(d.delivery_date)})`.slice(0, 300),
      quantity: d.quantity,
      unitPriceMinor: d.unit_price_minor,
      taxRateBp: d.tax_rate_bp,
      sacCode: d.sac_code,
    });
  }
  const charges = new Map<string, { n: number; d: BillableDelivery }>();
  for (const d of billable.filter((x) => x.delivery_charge_minor > 0)) {
    const key = `${d.delivery_charge_minor}|${d.tax_rate_bp}|${d.sac_code ?? ""}`;
    const g = charges.get(key) ?? { n: 0, d };
    g.n += 1;
    charges.set(key, g);
  }
  for (const { n, d } of charges.values()) {
    lines.push({
      description: `Delivery, ${n} ${n === 1 ? "time" : "times"}`,
      quantity: n,
      unitPriceMinor: d.delivery_charge_minor,
      taxRateBp: d.tax_rate_bp,
      sacCode: d.sac_code,
    });
  }
  return lines;
}
