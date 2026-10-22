import { describe, expect, it } from "vitest";
import { zonedInstant } from "./food";
import { cancellationOutcome, DEFAULT_CANCEL_RULE, holidayDates, stayUnits } from "./cancellation";

// Thursday 4 November 2027 to Monday 8 November 2027: Thu, Fri, Sat, Sun nights. Friday the 5th is a holiday.
const units = ["2027-11-04", "2027-11-05", "2027-11-06", "2027-11-07"].map((date) => ({ date, priceMinor: 100000 }));
const holidays = holidayDates([{ start_date: "2027-11-05", end_date: "2027-11-05", is_holiday: true }, { start_date: "2027-12-24", end_date: "2027-12-26", is_holiday: false }]);
const base = { units, checkInTime: "10:00", timeZone: "Asia/Kolkata", rule: DEFAULT_CANCEL_RULE, weekendDays: [6, 7], holidays, paidMinor: 400000 };
const at = (date: string, time: string) => zonedInstant(date, time, "Asia/Kolkata");

describe("cancelling a stay night by night (M38)", () => {
  it("with enough notice: the weekday is refunded, the holiday and weekend nights kept as credit", () => {
    const r = cancellationOutcome({ ...base, askedAt: at("2027-11-01", "09:00") });
    expect(r.nights.map((n) => [n.date, n.weekend, n.onTime, n.outcome])).toEqual([
      ["2027-11-04", false, true, "refund"],
      ["2027-11-05", true, true, "credit"],
      ["2027-11-06", true, true, "credit"],
      ["2027-11-07", true, true, "credit"],
    ]);
    expect([r.refundMinor, r.creditMinor, r.keptMinor]).toEqual([100000, 300000, 0]);
  });

  it("without enough notice for the first night: that weekday becomes credit too; the next night still has its notice", () => {
    // Asked at 11:00 the day before: 23 hours before the first check-in, 47 before the second.
    const r = cancellationOutcome({ ...base, askedAt: at("2027-11-03", "11:00") });
    expect(r.nights.map((n) => [n.onTime, n.outcome])).toEqual([[false, "credit"], [true, "credit"], [true, "credit"], [true, "credit"]]);
    expect([r.refundMinor, r.creditMinor]).toEqual([0, 400000]);
  });

  it("puts the money paid to the refund first, then credit, and keeps the rest", () => {
    const rule = { ...DEFAULT_CANCEL_RULE, weekend_late: "keep" as const };
    const r = cancellationOutcome({ ...base, rule, paidMinor: 250000, askedAt: at("2027-11-06", "12:00") });
    // Thu and Fri passed their notice (credit), Sat and Sun late weekend nights (kept).
    expect(r.nights.map((n) => n.outcome)).toEqual(["credit", "keep", "keep", "keep"]);
    expect([r.creditValue, r.keptValue]).toEqual([100000, 300000]);
    expect([r.refundMinor, r.creditMinor, r.keptMinor]).toEqual([0, 100000, 150000]);
  });

  it("when the kennel cancels, gives everything as the parent chose", () => {
    const r = cancellationOutcome({ ...base, askedAt: at("2027-11-06", "12:00"), byKennel: "refund" });
    expect([r.refundMinor, r.creditMinor, r.keptMinor]).toEqual([400000, 0, 0]);
    expect(cancellationOutcome({ ...base, askedAt: at("2027-11-06", "12:00"), byKennel: "credit" }).creditMinor).toBe(400000);
  });
});

describe("a stay's nights and what each is worth", () => {
  it("spreads a package evenly with the odd paise last, and takes a discount off the last nights", () => {
    const b = { kind: "boarding" as const, start_date: "2027-11-04", end_date: "2027-11-07", discount_minor: 0 };
    expect(stayUnits(b, [{ part: "package", quantity: 1, unitPriceMinor: 100001, discountMinor: 0 }]).map((u) => u.priceMinor)).toEqual([33333, 33333, 33335]);
    expect(stayUnits({ ...b, discount_minor: 150000 }, [{ part: "stay", quantity: 3, unitPriceMinor: 120000, discountMinor: 150000 }]).map((u) => u.priceMinor)).toEqual([120000, 90000, 0]);
  });

  it("puts days of day boarding first, and a day from a pack at nothing", () => {
    const b = { kind: "boarding" as const, start_date: "2027-11-04", end_date: "2027-11-07", boarding_from: "2027-11-05", discount_minor: 0 };
    expect(stayUnits(b, [{ part: "days", quantity: 1, unitPriceMinor: 60000, discountMinor: 0 }, { part: "stay", quantity: 2, unitPriceMinor: 120000, discountMinor: 0 }]).map((u) => [u.date, u.priceMinor])).toEqual([
      ["2027-11-04", 60000], ["2027-11-05", 120000], ["2027-11-06", 120000],
    ]);
    expect(stayUnits({ kind: "daycare", start_date: "2027-11-04", end_date: "2027-11-04", discount_minor: 0, pass_id: "p" }, []).map((u) => u.priceMinor)).toEqual([0]);
  });
});
