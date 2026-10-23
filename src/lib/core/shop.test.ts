import { describe, expect, it } from "vitest";
import { computeInvoice } from "./tax";
import { parseQuantity } from "./food";
import { quantitiesFrom, reorderList, saleLines, saleSubtotal, stillToCome, typedQuantity } from "./shop";

describe("selling over the counter (M62)", () => {
  const sold = [
    { description: "Chew bone", quantity: 2, unit_price_minor: 25000, tax_rate_bp: 1800, hsn_code: "23091000" },
    { description: "Rope toy", quantity: 1, unit_price_minor: 40000, tax_rate_bp: 1200, hsn_code: null },
  ];

  it("puts each thing on the bill at the price, rate and code it was sold at", () => {
    expect(saleLines(sold)).toEqual([
      { description: "Chew bone", quantity: 2, unitPriceMinor: 25000, discountMinor: 0, taxRateBp: 1800, sacCode: "23091000" },
      { description: "Rope toy", quantity: 1, unitPriceMinor: 40000, discountMinor: 0, taxRateBp: 1200, sacCode: null },
    ]);
    expect(saleSubtotal(sold)).toBe(90000);
  });

  it("works out the tax on a sale as on any bill", () => {
    const bill = computeInvoice(saleLines(sold), { mode: "gst_india", sellerStateCode: "29", placeOfSupplyStateCode: "29", pricesIncludeTax: false }, { roundToWholeUnit: true });
    // 500.00 at 18% is 90.00 tax; 400.00 at 12% is 48.00; 1,038.00 in all.
    expect(bill.taxMinor).toBe(13800);
    expect(bill.totalMinor).toBe(103800);
    const noTax = computeInvoice(saleLines(sold), { mode: "none" }, { roundToWholeUnit: true });
    expect(noTax.totalMinor).toBe(90000);
  });

  it("reads the quantities typed on the counter's form", () => {
    const known = new Set(["a", "b", "c"]);
    expect(
      quantitiesFrom(
        [
          ["qty-a", "2"],
          ["qty-b", ""],
          ["qty-c", " 0 "],
          ["qty-z", "5"],
          ["note", "x"],
        ],
        known,
      ),
    ).toEqual([{ item_id: "a", quantity: 2 }]);
    expect(quantitiesFrom([["qty-a", "1.5"]], known)).toBeNull();
    expect(quantitiesFrom([["qty-a", "-1"]], known)).toBeNull();
    expect(quantitiesFrom([["qty-a", "1001"]], known)).toBeNull();
    expect(quantitiesFrom([["qty-a", "1000"]], known)).toEqual([{ item_id: "a", quantity: 1000 }]);
  });

  it("lists what to reorder, with what is already on its way last", () => {
    const items = [
      { item_id: "1", name: "Shampoo", on_hand: 2, low_level: 3 },
      { item_id: "2", name: "Collar", on_hand: 1, low_level: 2 },
      { item_id: "3", name: "Bone", on_hand: 10, low_level: 3 },
      { item_id: "4", name: "Brush", on_hand: 0, low_level: null },
      { item_id: "5", name: "Ball", on_hand: 0, low_level: 0, is_active: false },
    ];
    const list = reorderList(items, new Map([["1", 5]]));
    expect(list.map((l) => [l.name, l.on_order, l.coming])).toEqual([
      ["Collar", 0, false],
      ["Shampoo", 5, true],
    ]);
  });

  it("writes a quantity back as it is typed, so it reads the same", () => {
    expect(typedQuantity(2500, "g")).toBe("2.5 kg");
    expect(typedQuantity(750, "g")).toBe("750 g");
    expect(typedQuantity(1250, "ml")).toBe("1.25 l");
    expect(typedQuantity(1500, "piece")).toBe("1500");
    for (const [n, unit] of [[2500, "g"], [750, "g"], [1250, "ml"], [1500, "piece"], [1001, "g"]] as const) {
      expect(parseQuantity(typedQuantity(n, unit), unit)).toBe(n);
    }
  });

  it("never counts more than was ordered as still to come", () => {
    expect(stillToCome(10, 4)).toBe(6);
    expect(stillToCome(10, 12)).toBe(0);
  });
});
