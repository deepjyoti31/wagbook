import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "./csv";
import { isYearMonth, monthBounds, monthName, parseRange, shiftMonth, summariseOccupancy } from "./reports";

describe("months", () => {
  it("knows a real month when it sees one", () => {
    expect(isYearMonth("2026-10")).toBe(true);
    expect(isYearMonth("2026-13")).toBe(false);
    expect(isYearMonth("2026-1")).toBe(false);
    expect(isYearMonth(undefined)).toBe(false);
  });

  it("gives the first and last day, leap years included", () => {
    expect(monthBounds("2026-10")).toEqual({ first: "2026-10-01", last: "2026-10-31" });
    expect(monthBounds("2028-02")).toEqual({ first: "2028-02-01", last: "2028-02-29" });
    expect(monthBounds("2027-02")).toEqual({ first: "2027-02-01", last: "2027-02-28" });
    expect(monthBounds("2026-12")).toEqual({ first: "2026-12-01", last: "2026-12-31" });
  });

  it("moves across years in both directions", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2027-01", -1)).toBe("2026-12");
    expect(shiftMonth("2026-10", -11)).toBe("2025-11");
    expect(shiftMonth("2026-10", 0)).toBe("2026-10");
  });

  it("names a month", () => {
    expect(monthName("2026-10")).toBe("October 2026");
  });
});

describe("occupancy summary", () => {
  it("counts nights and days, finds the busiest day and how full the kennel was", () => {
    const s = summariseOccupancy([
      { day: "2026-10-01", boarding: 2, dayBoarding: 1, capacity: 4 },
      { day: "2026-10-02", boarding: 3, dayBoarding: 1, capacity: 4 },
      { day: "2026-10-03", boarding: 4, dayBoarding: 0, capacity: 4 },
      { day: "2026-10-04", boarding: 0, dayBoarding: 0, capacity: 4 },
    ]);
    expect(s).toEqual({ nights: 9, days: 2, busiest: { day: "2026-10-02", pets: 4 }, percentFull: 69 });
  });

  it("says nothing about a busiest day or fullness when there is nothing to say", () => {
    expect(summariseOccupancy([{ day: "2026-10-01", boarding: 0, dayBoarding: 0, capacity: 0 }])).toEqual({
      nights: 0, days: 0, busiest: null, percentFull: null,
    });
  });
});

describe("download range", () => {
  it("accepts a real range of up to 400 days, and nothing else", () => {
    expect(parseRange("2026-10-01", "2026-10-31")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(parseRange("2026-10-01", "2026-10-01")).not.toBeNull();
    expect(parseRange("2026-10-31", "2026-10-01")).toBeNull();
    expect(parseRange("2026-01-01", "2027-02-05")).not.toBeNull();
    expect(parseRange("2026-01-01", "2027-02-06")).toBeNull();
    expect(parseRange("2026-02-30", "2026-03-01")).toBeNull();
    expect(parseRange(undefined, "2026-03-01")).toBeNull();
  });
});

describe("CSV", () => {
  it("quotes what needs quoting and leaves the rest", () => {
    expect(csvCell("Biscuit")).toBe("Biscuit");
    expect(csvCell("Sharma, Priya")).toBe('"Sharma, Priya"');
    expect(csvCell('The "big" one')).toBe('"The ""big"" one"');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(1200)).toBe("1200");
    expect(csvCell(true)).toBe("yes");
  });

  it("stops a spreadsheet running text as a formula, but keeps negative numbers", () => {
    expect(csvCell("=HYPERLINK(\"http://x\")")).toBe('"\'=HYPERLINK(""http://x"")"');
    expect(csvCell("+91 98450 12345")).toBe("'+91 98450 12345");
    expect(csvCell("@me")).toBe("'@me");
    expect(csvCell("-1+1")).toBe("'-1+1");
    expect(csvCell("-12.50")).toBe("-12.50");
    expect(csvCell(-5)).toBe("-5");
  });

  it("starts with a byte order mark and ends every line with CRLF", () => {
    expect(toCsv(["Name", "Amount"], [["Biscuit", "1200.00"], ["Pepper", null]])).toBe("﻿Name,Amount\r\nBiscuit,1200.00\r\nPepper,\r\n");
  });
});
