import { describe, expect, it } from "vitest";
import { ageOn, formatDay, formatWeekday, shortRange } from "./dates";

describe("short dates", () => {
  it("writes a day without its year", () => {
    expect(formatDay("2026-11-02")).toBe("2 Nov");
  });

  it("writes the day a screen is about with its weekday", () => {
    expect(formatWeekday("2026-11-02")).toBe("Monday, 2 November");
  });

  it("writes a stay's two ends as short as they can be read", () => {
    expect(shortRange("2026-11-02", "2026-11-06", 2026)).toEqual(["2", "6 Nov"]);
    expect(shortRange("2026-10-29", "2026-11-02", 2026)).toEqual(["29 Oct", "2 Nov"]);
  });

  it("keeps the years when the stay is not all in this year", () => {
    expect(shortRange("2026-12-29", "2027-01-02", 2026)).toEqual(["29 Dec 2026", "2 Jan 2027"]);
    expect(shortRange("2027-04-14", "2027-04-17", 2026)).toEqual(["14 Apr 2027", "17 Apr 2027"]);
  });
});

describe("ageOn", () => {
  it("counts whole years, and whole months under a year", () => {
    expect(ageOn("2022-11-12", "2026-11-12")).toEqual({ years: 4 });
    expect(ageOn("2022-11-13", "2026-11-12")).toEqual({ years: 3 });
    expect(ageOn("2026-04-20", "2026-11-12")).toEqual({ months: 6 });
    expect(ageOn("2026-11-01", "2026-11-12")).toEqual({ months: 0 });
  });

  it("says nothing for a birthday still to come", () => {
    expect(ageOn("2027-01-01", "2026-11-12")).toBeNull();
  });
});
