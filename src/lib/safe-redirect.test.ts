import { describe, expect, it } from "vitest";
import { safeDestination } from "./safe-redirect";

const here = "https://book.example.in";

describe("safeDestination", () => {
  it("keeps a path on this site, with its query", () => {
    expect(safeDestination("/onboarding", here)).toBe("/onboarding");
    expect(safeDestination("/app/bookings?show=past", here)).toBe("/app/bookings?show=past");
  });

  it("falls back when there is nothing to go on", () => {
    expect(safeDestination(null, here)).toBe("/app");
    expect(safeDestination("", here)).toBe("/app");
  });

  it("refuses every way of naming another site", () => {
    for (const attack of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "/\\/evil.example",
      "/\t/evil.example",
      "/\n/evil.example",
      "\\\\evil.example",
      "javascript:alert(1)",
      "evil.example",
    ]) {
      const result = safeDestination(attack, here);
      expect(new URL(result, here).origin, attack).toBe(here);
    }
  });
});
