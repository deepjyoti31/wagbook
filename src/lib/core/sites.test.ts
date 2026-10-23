import { describe, expect, it } from "vitest";
import { combineSites, summariseSite, type SiteFigures } from "./sites";

const site = (over: Partial<SiteFigures>): SiteFigures => ({
  orgId: "a",
  name: "North",
  currency: "INR",
  nights: 0,
  days: 0,
  kennelDays: 0,
  kennelsUsed: 0,
  billedMinor: 0,
  creditedMinor: 0,
  receivedMinor: 0,
  refundedMinor: 0,
  spentMinor: 0,
  owedMinor: 0,
  billsOwed: 0,
  ...over,
});

describe("all sites", () => {
  const north = site({ orgId: "a", name: "North", nights: 40, days: 6, kennelDays: 100, kennelsUsed: 40, billedMinor: 500000, creditedMinor: 20000, receivedMinor: 400000, refundedMinor: 10000, spentMinor: 150000, owedMinor: 90000, billsOwed: 2 });
  const south = site({ orgId: "b", name: "South", nights: 10, days: 4, kennelDays: 300, kennelsUsed: 20, billedMinor: 100000, receivedMinor: 120000, spentMinor: 30000, owedMinor: 5000, billsOwed: 1 });

  it("shows one site as its own report does", () => {
    expect(summariseSite(north)).toEqual({
      currency: "INR", sites: 1, nights: 40, days: 6, percentFull: 40, billedMinor: 480000, receivedMinor: 400000,
      refundedMinor: 10000, spentMinor: 150000, netMinor: 240000, owedMinor: 90000, billsOwed: 2,
    });
  });

  it("adds the sites up, and works out how full from the kennels, not by averaging the sites", () => {
    expect(combineSites([north, south])).toEqual([
      {
        currency: "INR", sites: 2, nights: 50, days: 10, percentFull: 15, billedMinor: 580000, receivedMinor: 520000,
        refundedMinor: 10000, spentMinor: 180000, netMinor: 330000, owedMinor: 95000, billsOwed: 3,
      },
    ]);
  });

  it("never adds two currencies together", () => {
    const abroad = site({ orgId: "c", name: "Dubai", currency: "AED", nights: 3, kennelDays: 10, kennelsUsed: 3, receivedMinor: 70000 });
    const totals = combineSites([north, abroad, south]);
    expect(totals.map((t) => [t.currency, t.sites, t.nights, t.receivedMinor])).toEqual([
      ["INR", 2, 50, 520000],
      ["AED", 1, 3, 70000],
    ]);
  });

  it("says nothing about how full sites with no kennels were", () => {
    expect(combineSites([site({})])[0].percentFull).toBeNull();
    expect(combineSites([])).toEqual([]);
  });
});
