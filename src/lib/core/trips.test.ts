import { describe, expect, it } from "vitest";
import { tripLines, type BillableTrip } from "./trips";

const trip = (o: Partial<BillableTrip>): BillableTrip => ({ kind: "pickup", status: "planned", trip_date: "2026-11-03", at_time: "09:00:00", price_minor: 30000, tax_rate_bp: 1800, sac_code: "998612", ...o });

describe("trip lines on a stay's bill", () => {
  it("bills each pick-up and drop in order, with its price and tax", () => {
    expect(tripLines("Biscuit", [trip({ kind: "drop", trip_date: "2026-11-06", at_time: "17:30:00" }), trip({})])).toEqual([
      { description: "Pick-up for Biscuit (3 Nov, 09:00)", quantity: 1, unitPriceMinor: 30000, taxRateBp: 1800, sacCode: "998612" },
      { description: "Drop for Biscuit (6 Nov, 17:30)", quantity: 1, unitPriceMinor: 30000, taxRateBp: 1800, sacCode: "998612" },
    ]);
  });

  it("leaves out a cancelled trip, and a free one is a line at nothing", () => {
    expect(tripLines("Biscuit", [trip({ status: "cancelled" })])).toEqual([]);
    expect(tripLines("Biscuit", [trip({ price_minor: null, status: "done" })])[0].unitPriceMinor).toBe(0);
  });
});
