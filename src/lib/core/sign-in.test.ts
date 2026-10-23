import { describe, expect, it } from "vitest";
import { madeByResetLink } from "./sign-in";

describe("madeByResetLink", () => {
  const now = Date.UTC(2026, 9, 22, 10, 0, 0);
  const at = (minutesAgo: number) => now / 1000 - minutesAgo * 60;

  it("is true only for a session a reset link made within the hour", () => {
    expect(madeByResetLink({ amr: [{ method: "recovery", timestamp: at(5) }] }, now)).toBe(true);
    // Two-step sign-in adds its own entry after the link's.
    expect(madeByResetLink({ amr: [{ method: "totp", timestamp: at(1) }, { method: "recovery", timestamp: at(5) }] }, now)).toBe(true);
    expect(madeByResetLink({ amr: [{ method: "recovery", timestamp: at(61) }] }, now)).toBe(false);
    expect(madeByResetLink({ amr: [{ method: "password", timestamp: at(1) }] }, now)).toBe(false);
    expect(madeByResetLink({ amr: [{ method: "oauth", timestamp: at(1) }] }, now)).toBe(false);
    expect(madeByResetLink({}, now)).toBe(false);
    expect(madeByResetLink(null, now)).toBe(false);
  });
});
