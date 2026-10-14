import { describe, expect, it } from "vitest";
import { describeEntry, fieldLabel, historyLink, idsIn, valueText, type HistoryFormat } from "./history";

const booking = "11111111-2222-4333-8444-555555555555";
const ravi = "d0000000-0000-4000-8000-000000000002";
const fmt: HistoryFormat = {
  money: (minor) => `Rs ${(minor / 100).toFixed(2)}`,
  time: (iso) => `at ${iso.slice(11, 16)}`,
  name: (id) => (id === ravi ? "Ravi" : undefined),
};

describe("history in words", () => {
  it("names fields plainly", () => {
    expect(fieldLabel("tax_rate_bp")).toBe("Tax rate");
    expect(fieldLabel("rate_minor")).toBe("Rate");
    expect(fieldLabel("kennel_id")).toBe("Kennel");
    expect(fieldLabel("checked_in_at")).toBe("Checked in at");
  });

  it("shows money, rates, yes and no, lists and empty values as a person reads them", () => {
    expect(valueText("rate_minor", 120000, fmt)).toBe("Rs 1200.00");
    expect(valueText("tax_rate_bp", 1800, fmt)).toBe("18%");
    expect(valueText("is_active", false, fmt)).toBe("no");
    expect(valueText("flags", ["bites", "escape_risk"], fmt)).toBe("bites, escape risk");
    expect(valueText("notes", null, fmt)).toBe("empty");
    expect(valueText("notes", "x".repeat(200), fmt)).toHaveLength(160);
  });

  it("shows a moment on the kennel's clock and an id as the name it points at", () => {
    expect(valueText("checked_in_at", "2026-10-14T17:45:56.689+00:00", fmt)).toBe("at 17:45");
    expect(valueText("checked_in_by", ravi, fmt)).toBe("Ravi");
    expect(valueText("kennel_id", booking, fmt)).toBe("a record no longer here");
    expect(valueText("start_date", "2026-10-14", fmt)).toBe("2026-10-14");
    expect(idsIn({ action: "update", table_name: "bookings", row_id: booking, old_data: { kennel_id: booking }, new_data: { kennel_id: ravi, notes: "x" } })).toEqual([booking, ravi]);
  });

  it("lists each changed field as it was and as it is now, leaving out bookkeeping", () => {
    const d = describeEntry(
      { action: "update", table_name: "bookings", row_id: booking, old_data: { rate_minor: 120000, notes: null, updated_at: "x" }, new_data: { rate_minor: 100000, notes: "Regular", updated_at: "y" } },
      fmt,
    );
    expect(d).toEqual({
      title: "Booking changed",
      fields: [
        { label: "Rate", was: "Rs 1200.00", now: "Rs 1000.00" },
        { label: "Notes", was: "empty", now: "Regular" },
      ],
    });
  });

  it("lists only what an added or removed row had in it", () => {
    const added = describeEntry({ action: "insert", table_name: "expenses", row_id: booking, old_data: null, new_data: { id: booking, org_id: booking, category: "Food", amount_minor: 30000, vendor: null } }, fmt);
    expect(added).toEqual({ title: "Expense added", fields: [{ label: "Category", was: null, now: "Food" }, { label: "Amount", was: null, now: "Rs 300.00" }] });
    const removed = describeEntry({ action: "delete", table_name: "expenses", row_id: booking, old_data: { category: "Food" }, new_data: null }, fmt);
    expect(removed).toEqual({ title: "Expense removed", fields: [{ label: "Category", was: "Food", now: null }] });
  });

  it("links to where the row can be seen today", () => {
    expect(historyLink({ action: "update", table_name: "bookings", row_id: booking, old_data: {}, new_data: {} })).toBe(`/app/bookings/${booking}`);
    expect(historyLink({ action: "delete", table_name: "bookings", row_id: booking, old_data: {}, new_data: null })).toBeNull();
    expect(historyLink({ action: "insert", table_name: "booking_items", row_id: null, old_data: null, new_data: { booking_id: booking } })).toBe(`/app/bookings/${booking}`);
    expect(historyLink({ action: "insert", table_name: "payments", row_id: null, old_data: null, new_data: { invoice_id: booking } })).toBe(`/app/bills/${booking}`);
    expect(historyLink({ action: "update", table_name: "organizations", row_id: booking, old_data: {}, new_data: {} })).toBeNull();
  });
});
