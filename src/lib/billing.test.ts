import { describe, expect, it } from "vitest";
import { billForBooking, billForFamily, creditContext, differenceCredit, moneyLines, partCredit, seriesLines, staysChanged, taxContext } from "./billing";

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

describe("a family's bill", () => {
  const stay = { kind: "boarding" as const, start_date: "2027-04-14", end_date: "2027-04-17", discount_minor: 0, tax_rate_bp: 0, sac_code: null };
  it("puts each pet's stay and then its extras on one bill, saying whose each extra is", () => {
    const bill = billForFamily(org, [
      { petName: "Bruno", booking: { ...stay, rate_minor: 120000 }, items: [{ description: "Bath", quantity: 1, unit_price_minor: 50000, tax_rate_bp: 0, sac_code: null }] },
      { petName: "Coco", booking: { ...stay, rate_minor: 90000 }, items: [] },
    ]);
    expect(bill.lines.map((l) => [l.quantity, l.unitPriceMinor])).toEqual([
      [3, 120000],
      [1, 50000],
      [3, 90000],
    ]);
    expect(bill.lines[1].description).toBe("Bruno: Bath");
    expect(bill.lines[2].description).toContain("Coco");
    expect(bill.totalMinor).toBe(360000 + 50000 + 270000);
  });
});

describe("credit notes", () => {
  const gstBill = { is_tax_invoice: true, prices_include_tax: false, place_of_supply_state_code: "29", seller: { tax_mode: "gst_india", gst_state_code: "29" } };

  it("work tax out as the bill did when it was issued, not as the kennel's settings say now", () => {
    expect(creditContext(gstBill)).toEqual({ mode: "gst_india", sellerStateCode: "29", placeOfSupplyStateCode: "29", pricesIncludeTax: false });
    expect(creditContext({ ...gstBill, is_tax_invoice: false }).mode).toBe("none");
    expect(creditContext({ ...gstBill, place_of_supply_state_code: "27" }).placeOfSupplyStateCode).toBe("27");
  });

  it("take back part of a bill as one line at one of its rates", () => {
    const t = partCredit(gstBill, { description: "One night not stayed", amountMinor: 120000, taxRateBp: 1800, sacCode: "998612" }, true);
    expect(t.lines).toHaveLength(1);
    expect(t).toMatchObject({ taxableMinor: 120000, cgstMinor: 10800, sgstMinor: 10800, totalMinor: 141600 });
    // With prices that included tax, the amount is what the parent paid.
    expect(partCredit({ ...gstBill, prices_include_tax: true }, { description: "x", amountMinor: 118000, taxRateBp: 1800, sacCode: null }, false).totalMinor).toBe(118000);
  });
});

describe("a bill whose stays changed", () => {
  const stay = { kind: "boarding" as const, start_date: "2027-04-14", discount_minor: 0, tax_rate_bp: 0, sac_code: null, rate_minor: 120000 };
  const asBilled = (t: ReturnType<typeof billForBooking>) =>
    t.lines.map((l) => ({ quantity: l.quantity, unit_price_minor: l.unitPriceMinor, discount_minor: l.discountMinor, tax_rate_bp: l.taxRateBp, taxable_minor: l.taxableMinor, total_minor: l.totalMinor, sac_code: l.sacCode ?? null }));
  const plain = { is_tax_invoice: false, prices_include_tax: false, place_of_supply_state_code: null, seller: null };

  it("offers the nights not stayed back as a credit note", () => {
    const billed = asBilled(billForBooking(org, "Bruno", { ...stay, end_date: "2027-04-17" }, []));
    const now = billForBooking(org, "Bruno", { ...stay, end_date: "2027-04-15" }, []);
    expect(staysChanged(billed, now)).toBe(true);
    const credit = differenceCredit(plain, billed, [], moneyLines(now), "Not stayed", true);
    expect(credit?.totalMinor).toBe(240000);
    // After that credit note, nothing more.
    expect(differenceCredit(plain, billed, moneyLines(credit!), moneyLines(now), "Not stayed", true)).toBeNull();
  });

  it("never offers back a line a manager added to the bill by hand", () => {
    const made = billForBooking(org, "Bruno", { ...stay, end_date: "2027-04-17" }, []);
    const billed = [...asBilled(made), { quantity: 1, unit_price_minor: 50000, discount_minor: 0, tax_rate_bp: 0, taxable_minor: 50000, total_minor: 50000, sac_code: null }];
    expect(staysChanged(billed, made)).toBe(false);
  });

  it("offers the whole bill when every stay on it is cancelled", () => {
    const billed = asBilled(billForBooking(org, "Bruno", { ...stay, end_date: "2027-04-17" }, []));
    expect(staysChanged(billed, billForFamily(org, []))).toBe(true);
  });
});

describe("a month of a repeating series", () => {
  const day = (date: string, extra?: string) => ({
    booking: { kind: "daycare" as const, start_date: date, end_date: date, rate_minor: 72000, discount_minor: 0, tax_rate_bp: 0, sac_code: null },
    items: extra ? [{ description: extra, quantity: 1, unit_price_minor: 50000, tax_rate_bp: 0, sac_code: null }] : [],
  });
  it("is one line for each price with its days listed, then each day's extras with its date", () => {
    const lines = seriesLines("Tofu", "2027-10-01", [day("2027-10-11", "Bath"), day("2027-10-04"), day("2027-10-13")]);
    expect(lines.map((l) => [l.description, l.quantity, l.unitPriceMinor])).toEqual([
      ["Day boarding: Tofu, 3 days in October 2027 (4, 11, 13 Oct)", 3, 72000],
      ["11 Oct: Bath", 1, 50000],
    ]);
  });
  it("keeps days at another price, and days from a pack, on lines of their own", () => {
    const pack = { ...day("2027-10-06"), booking: { ...day("2027-10-06").booking, rate_minor: 0, pass_id: "p" } };
    const lines = seriesLines("Tofu", "2027-10-01", [day("2027-10-04"), pack]);
    expect(lines.map((l) => l.description)).toEqual(["Day boarding: Tofu, 1 day in October 2027 (4 Oct)", "Day boarding: Tofu, 1 day from a pack in October 2027 (6 Oct)"]);
  });
});
