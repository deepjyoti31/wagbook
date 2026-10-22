import { describe, expect, it } from "vitest";
import { stayLines, toStayCharges, wholeStayCharge } from "./stay";

describe("stay lines", () => {
  const stay = { kind: "boarding" as const, petName: "Bruno", startDate: "2027-04-14", endDate: "2027-04-19", rateMinor: 90000, taxRateBp: 1800 };

  it("is one line for the whole stay unless it is split", () => {
    expect(wholeStayCharge({ ...stay, discountMinor: 500 })).toEqual([{ part: "stay", quantity: 5, unitPriceMinor: 90000, discountMinor: 500 }]);
    expect(stayLines(stay).map((l) => [l.description, l.quantity])).toEqual([["Boarding: Bruno, 5 nights (14 Apr 2027 to 19 Apr 2027)", 5]]);
  });

  it("names nights shared and nights alone, each at its own price, with the tax of the stay", () => {
    const lines = stayLines({
      ...stay,
      charges: toStayCharges([
        { part: "shared", quantity: 3, unit_price_minor: 90000, discount_minor: 1000 },
        { part: "alone", quantity: 2, unit_price_minor: 120000, discount_minor: 0 },
      ]),
    });
    expect(lines).toEqual([
      { description: "Boarding: Bruno, 3 nights sharing a kennel (14 Apr 2027 to 19 Apr 2027)", quantity: 3, unitPriceMinor: 90000, discountMinor: 1000, taxRateBp: 1800, sacCode: null },
      { description: "Boarding: Bruno, 2 nights with the kennel to itself", quantity: 2, unitPriceMinor: 120000, discountMinor: 0, taxRateBp: 1800, sacCode: null },
    ]);
  });

  it("names the days of day boarding before the first night, and the nights from it", () => {
    const lines = stayLines({
      ...stay,
      boardingFrom: "2027-04-16",
      charges: toStayCharges([
        { part: "days", quantity: 2, unit_price_minor: 70000, discount_minor: 0 },
        { part: "stay", quantity: 3, unit_price_minor: 120000, discount_minor: 0 },
      ]),
    });
    expect(lines.map((l) => l.description)).toEqual([
      "Day boarding: Bruno, 2 days (14 Apr 2027 to 15 Apr 2027)",
      "Boarding: Bruno, 3 nights (16 Apr 2027 to 19 Apr 2027)",
    ]);
  });

  it("says a day was paid from a pack", () => {
    const lines = stayLines({ kind: "daycare", petName: "Tofu", startDate: "2027-04-14", endDate: "2027-04-14", rateMinor: 0, fromPack: true });
    expect(lines[0]).toMatchObject({ description: "Day boarding: Tofu, 1 day from a pack (14 Apr 2027 to 14 Apr 2027)", unitPriceMinor: 0 });
  });

  it("reads an unknown part as the whole stay", () => {
    expect(toStayCharges([{ part: "other", quantity: 1, unit_price_minor: 1, discount_minor: 0 }])[0].part).toBe("stay");
  });

  it("bills a stay with a package as one line, the package for the whole stay (M37)", () => {
    const charges = toStayCharges([{ part: "package", quantity: 1, unit_price_minor: 1500000, discount_minor: 0 }]);
    const lines = stayLines({ kind: "boarding", petName: "Biscuit", startDate: "2026-11-03", endDate: "2026-11-10", rateMinor: 0, charges, packageName: "Holiday package" });
    expect(lines.map((l) => [l.description, l.quantity, l.unitPriceMinor])).toEqual([["Holiday package: Biscuit, 7 nights (3 Nov 2026 to 10 Nov 2026)", 1, 1500000]]);
  });
});
