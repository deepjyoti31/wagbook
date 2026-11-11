import { describe, expect, it } from "vitest";
import { monthOf, nextMonth, scopeOf, type ScopeColumns } from "./stay-bill";

const none: ScopeColumns = {
  booking_id: null, group_id: null, series_id: null, series_month: null, subscription_id: null,
  period_start: null, period_end: null, delivery_id: null, appointment_id: null, sale_id: null,
};

describe("what a bill covers, from its row", () => {
  it("names each kind of bill", () => {
    expect(scopeOf({ ...none, booking_id: "b" })).toEqual({ booking: "b" });
    expect(scopeOf({ ...none, group_id: "g" })).toEqual({ group: "g" });
    expect(scopeOf({ ...none, series_id: "s", series_month: "2027-04-01" })).toEqual({ series: "s", month: "2027-04-01" });
    expect(scopeOf({ ...none, subscription_id: "u", period_start: "2027-04-05", period_end: "2027-04-11" })).toEqual({ subscription: "u", from: "2027-04-05", to: "2027-04-11" });
    expect(scopeOf({ ...none, delivery_id: "d" })).toEqual({ delivery: "d" });
  });
  it("names a visitor's appointment and a sale over the counter, which have no stay", () => {
    // Read without these two columns, such a bill covered nothing, and crediting what changed on it was refused.
    expect(scopeOf({ ...none, appointment_id: "a" })).toEqual({ appointment: "a" });
    expect(scopeOf({ ...none, sale_id: "x" })).toEqual({ sale: "x" });
  });
  it("is nothing for a one-off bill (a pack or a course)", () => {
    expect(scopeOf(none)).toBeNull();
  });
  it("knows a month's first day and the next month's", () => {
    expect(monthOf("2027-04-14")).toBe("2027-04-01");
    expect(nextMonth("2027-04-01")).toBe("2027-05-01");
    expect(nextMonth("2027-12-01")).toBe("2028-01-01");
  });
});
