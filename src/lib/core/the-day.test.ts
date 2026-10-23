import { describe, expect, it } from "vitest";
import { isoWeekday } from "./food";
import { canUndoPassing, houseJobsOn, stayReport, supplyAmount } from "./the-day";

describe("house jobs on a day (M51)", () => {
  it("are the active ones, every day or on that weekday", () => {
    expect(isoWeekday("2027-03-01")).toBe(1); // a Monday
    expect(isoWeekday("2027-03-07")).toBe(7);
    const jobs = [
      { id: "daily", weekday: null, is_active: true },
      { id: "monday", weekday: 1, is_active: true },
      { id: "sunday", weekday: 7, is_active: true },
      { id: "stopped", weekday: null, is_active: false },
    ];
    expect(houseJobsOn(jobs, "2027-03-01").map((j) => j.id)).toEqual(["daily", "monday"]);
    expect(houseJobsOn(jobs, "2027-03-07").map((j) => j.id)).toEqual(["daily", "sunday"]);
  });
});

describe("undoing a pet's passing (M52)", () => {
  it("is possible for a week after marking it", () => {
    const now = new Date("2027-03-10T10:00:00Z");
    expect(canUndoPassing("2027-03-04T10:00:00Z", now)).toBe(true);
    expect(canUndoPassing("2027-03-03T10:00:00Z", now)).toBe(true);
    expect(canUndoPassing("2027-03-03T09:59:00Z", now)).toBe(false);
    expect(canUndoPassing(null, now)).toBe(false);
  });
});

describe("the stay report (M53)", () => {
  const base = { kind: "boarding" as const, startDate: "2027-03-01", endDate: "2027-03-04", play: 5, incidents: [] };

  it("counts nights, meals eaten of those offered, medicines by label, play, and weight in and out", () => {
    const report = stayReport({
      ...base,
      tasks: [
        { kind: "meal", label: "Breakfast", status: "done" },
        { kind: "meal", label: "Dinner", status: "skipped" },
        { kind: "meal", label: "Breakfast", status: "done" },
        { kind: "meal", label: "Dinner", status: "pending" },
        { kind: "medication", label: "Tablet", status: "done" },
        { kind: "medication", label: "Tablet", status: "done" },
        { kind: "medication", label: "Ear drops", status: "skipped" },
      ],
      weights: [
        { on: "2027-01-20", grams: 20500 },
        { on: "2027-03-01", grams: 21000 },
        { on: "2027-03-03", grams: 20800 },
      ],
      incidents: [
        { on: "2027-03-02", category: "illness" },
        { on: "2027-03-03", category: "illness" },
        { on: "2027-03-03", category: "injury" },
      ],
    });
    expect(report).toEqual({
      units: 3,
      meals: { eaten: 2, offered: 3 },
      medicines: [
        { label: "Tablet", given: 2, due: 2 },
        { label: "Ear drops", given: 0, due: 1 },
      ],
      play: 5,
      weightIn: 21000,
      weightOut: 20800,
      incidents: [
        { category: "illness", count: 2 },
        { category: "injury", count: 1 },
      ],
    });
  });

  it("has no weight going out when the pet was weighed once", () => {
    expect(stayReport({ ...base, tasks: [], weights: [{ on: "2027-03-02", grams: 9000 }] })).toMatchObject({ weightIn: 9000, weightOut: null });
    expect(stayReport({ ...base, tasks: [], weights: [] })).toMatchObject({ weightIn: null, weightOut: null, meals: { eaten: 0, offered: 0 } });
  });

  it("counts days for day boarding", () => {
    expect(stayReport({ ...base, kind: "daycare", startDate: "2027-03-01", endDate: "2027-03-01", tasks: [], weights: [] }).units).toBe(1);
  });
});

describe("a supply in words (M55)", () => {
  const words = { grams: "{g} g", kilos: "{kg} kg", doses: "{n} doses" };
  it("reads grams as kilos past a kilo, and doses as they are", () => {
    expect(supplyAmount("food", 800, words)).toBe("800 g");
    expect(supplyAmount("food", 1250, words)).toBe("1.25 kg");
    expect(supplyAmount("medicine", 6, words)).toBe("6 doses");
  });
});
