import { describe, expect, it } from "vitest";
import { owedAtCheckOut } from "./owed";

const none = { series: false, bill: null, estimateMinor: 360000, advanceMinor: 0 };

describe("owedAtCheckOut", () => {
  it("reads an issued bill: what is left on it, or paid", () => {
    expect(owedAtCheckOut({ ...none, bill: { status: "issued", number: "WB/26-27/0001", totalMinor: 360000, dueMinor: 160000 } })).toEqual({
      kind: "due",
      amountMinor: 160000,
      number: "WB/26-27/0001",
    });
    expect(owedAtCheckOut({ ...none, bill: { status: "issued", number: "WB/26-27/0002", totalMinor: 360000, dueMinor: 0 } })).toEqual({ kind: "paid", number: "WB/26-27/0002" });
    // Paid over (a refund to give) is not owed by the parent.
    expect(owedAtCheckOut({ ...none, bill: { status: "issued", number: "WB/26-27/0003", totalMinor: 360000, dueMinor: -5000 } })?.kind).toBe("paid");
  });

  it("takes a draft's total, not the estimate, less what was paid ahead", () => {
    expect(owedAtCheckOut({ ...none, bill: { status: "draft", number: null, totalMinor: 300000, dueMinor: 0 }, advanceMinor: 100000 })).toEqual({
      kind: "draft",
      amountMinor: 200000,
      advanceMinor: 100000,
    });
  });

  it("works from the stay as it is now when there is no bill", () => {
    expect(owedAtCheckOut(none)).toEqual({ kind: "estimate", amountMinor: 360000, advanceMinor: 0 });
    expect(owedAtCheckOut({ ...none, advanceMinor: 400000 })).toEqual({ kind: "covered", advanceMinor: 400000 });
  });

  it("says nothing without a price, or for a stay that comes to nothing with nothing paid", () => {
    expect(owedAtCheckOut({ ...none, estimateMinor: null })).toBeNull();
    expect(owedAtCheckOut({ ...none, estimateMinor: 0 })).toBeNull();
  });

  it("leaves a day of a series to its month's bill", () => {
    expect(owedAtCheckOut({ ...none, series: true })).toEqual({ kind: "monthly" });
  });
});
