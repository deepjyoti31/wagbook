import { describe, expect, it } from "vitest";
import { isSacCode, parseRatePercent } from "./tax";

describe("tax rates and codes typed by the kennel", () => {
  it("reads a percent as basis points", () => {
    expect(parseRatePercent("18")).toBe(1800);
    expect(parseRatePercent(" 2.5 % ")).toBe(250);
    expect(parseRatePercent("0")).toBe(0);
    expect(parseRatePercent("")).toBeNull();
    expect(parseRatePercent(null)).toBeNull();
    for (const bad of ["101", "-5", "18.005", "eighteen", "1e2"]) expect(parseRatePercent(bad), bad).toBeUndefined();
  });

  it("takes a code of 4 to 8 digits", () => {
    expect(isSacCode("998612")).toBe(true);
    expect(isSacCode("9986")).toBe(true);
    for (const bad of ["998", "123456789", "99861A", ""]) expect(isSacCode(bad), bad).toBe(false);
  });
});
