import { describe, expect, it } from "vitest";
import { formatDay, formatWeekday, shortRange } from "./dates";

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
