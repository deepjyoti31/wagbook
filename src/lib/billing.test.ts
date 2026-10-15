import { describe, expect, it } from "vitest";
import { billForBooking, taxContext } from "./billing";

const org = { tax_mode: "none" as const, gst_state_code: null, prices_include_tax: false, round_invoice_totals: true };

describe("a booking's bill", () => {
  it("charges nights for boarding and days for day boarding, then each extra", () => {
    const boarding = billForBooking(org, "Bruno", { kind: "boarding", start_date: "2027-04-14", end_date: "2027-04-17", rate_minor: 120000, discount_minor: 10000, tax_rate_bp: 0, sac_code: null }, [
      { description: "Grooming", quantity: 1, unit_price_minor: 200000, tax_rate_bp: 0, sac_code: null },
    ]);
    expect(boarding.lines.map((l) => [l.quantity, l.unitPriceMinor, l.discountMinor])).toEqual([
      [3, 120000, 10000],
      [1, 200000, 0],
    ]);
    expect(boarding.totalMinor).toBe(360000 - 10000 + 200000);

    const day = billForBooking(org, "Tofu", { kind: "daycare", start_date: "2027-04-14", end_date: "2027-04-15", rate_minor: 72000, discount_minor: 0, tax_rate_bp: 0, sac_code: null }, []);
    expect(day.lines[0].quantity).toBe(2);
  });

  it("charges no tax when the kennel does not, whatever the booking carries", () => {
    const bill = billForBooking(org, "Bruno", { kind: "boarding", start_date: "2027-04-14", end_date: "2027-04-15", rate_minor: 120000, discount_minor: 0, tax_rate_bp: 1800, sac_code: null }, []);
    expect([bill.lines[0].taxRateBp, bill.taxMinor, bill.totalMinor]).toEqual([0, 0, 120000]);
  });

  it("uses the kennel's own state as the place of supply unless the bill says otherwise", () => {
    const gst = { ...org, tax_mode: "gst_india" as const, gst_state_code: "29" };
    expect(taxContext(gst).placeOfSupplyStateCode).toBe("29");
    expect(taxContext(gst, "27").placeOfSupplyStateCode).toBe("27");
  });
});
