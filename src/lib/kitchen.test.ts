import { describe, expect, it } from "vitest";
import { foodLines, type BillableDelivery } from "./food-bill";
import { parsePercentBp, percentText, placeLink, routeLink } from "./kitchen";

describe("percent settings", () => {
  it("are typed as percents and kept as basis points", () => {
    expect(parsePercentBp("2.5")).toBe(250);
    expect(parsePercentBp("33,33")).toBe(3333);
    expect(parsePercentBp("5%")).toBe(500);
    expect(parsePercentBp("101")).toBeNull();
    expect(parsePercentBp("4", 3)).toBeNull();
    expect(parsePercentBp("lots")).toBeNull();
    expect(parsePercentBp(null)).toBeNull();
    expect(percentText(3333)).toBe("33.33");
  });
});

describe("map links", () => {
  it("use the parent's own map link, or search for the address", () => {
    expect(placeLink({ map_url: "https://maps.app.goo.gl/x", line: "12 First Cross", area: null, postal_code: "560038" })).toBe("https://maps.app.goo.gl/x");
    expect(placeLink({ map_url: null, line: "12 First Cross", area: "Indiranagar", postal_code: "560038" })).toBe(
      "https://www.google.com/maps/search/?api=1&query=12+First+Cross%2C+Indiranagar%2C+560038",
    );
  });

  it("route through every stop in order, ending at the last", () => {
    const url = new URL(routeLink([
      { line: "1 A Street", area: null, postal_code: "560001" },
      { line: "2 B Road", area: "Domlur", postal_code: "560071" },
      { line: "3 C Lane", area: null, postal_code: "560038" },
    ]));
    expect(url.searchParams.get("destination")).toBe("3 C Lane, 560038");
    expect(url.searchParams.get("waypoints")).toBe("1 A Street, 560001|2 B Road, Domlur, 560071");
    expect(routeLink([])).toBe("https://www.google.com/maps");
  });
});

describe("food bill lines", () => {
  const d = (over: Partial<BillableDelivery>): BillableDelivery => ({
    kind: "subscription", status: "planned", delivery_date: "2027-03-02", grams: 1500, quantity: 1, unit_price_minor: 40000,
    delivery_charge_minor: 5000, tax_rate_bp: 0, sac_code: null, ...over,
  });

  it("add a subscription's kilos up by price, with each delivery's charge, leaving out cancelled ones and replacements", () => {
    const lines = foodLines("Bruno", [
      d({}),
      d({ delivery_date: "2027-03-05", grams: 2000 }),
      d({ delivery_date: "2027-03-09", status: "cancelled" }),
      d({ delivery_date: "2027-03-06", kind: "replacement", unit_price_minor: 0, delivery_charge_minor: 0 }),
    ]);
    expect(lines.map((l) => [l.description, l.quantity, l.unitPriceMinor, l.discountMinor ?? 0])).toEqual([
      ["Fresh food for Bruno: 3.5 kg, 2 deliveries (2 Mar, 5 Mar)", 3.5, 40000, 0],
      ["Delivery, 2 times", 2, 5000, 0],
    ]);
  });

  it("take the monthly discount off the food, not the delivery", () => {
    const [food, charge] = foodLines("Bruno", [d({}), d({ delivery_date: "2027-03-05", grams: 2000 })], 500);
    expect(food.discountMinor).toBe(7000);
    expect(charge.discountMinor).toBeUndefined();
  });

  it("bill a trial and an item each on their own line", () => {
    const lines = foodLines("Bruno", [
      d({ kind: "trial", grams: 1000, unit_price_minor: 49900, product_name: "Food trial", delivery_charge_minor: 0 }),
      d({ kind: "item", grams: 0, quantity: 2, unit_price_minor: 120000, product_name: "Birthday cake", delivery_date: "2027-03-07" }),
    ]);
    expect(lines.map((l) => [l.description, l.quantity, l.unitPriceMinor])).toEqual([
      ["Food trial for Bruno: 1 kg (2 Mar)", 1, 49900],
      ["Birthday cake for Bruno (7 Mar)", 2, 120000],
      ["Delivery, 1 time", 1, 5000],
    ]);
  });
});
