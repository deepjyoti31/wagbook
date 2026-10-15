import { describe, expect, it } from "vitest";
import { en } from "@/messages/en";
import { friendlyError, GENERIC_ERROR } from "./errors";
import { staysOverlap } from "./core";

describe("friendlyError", () => {
  it("shows the database's own WB messages without the code", () => {
    expect(friendlyError({ code: "23P01", message: "WB020: no space on 2027-04-14 (3 booked, 2 kennels)" })).toBe(
      "No space on 2027-04-14 (3 booked, 2 kennels)",
    );
  });
  it("explains constraint violations by name", () => {
    expect(friendlyError({ code: "23P01", message: 'conflicting key value violates exclusion constraint "bookings_no_kennel_overlap"' })).toContain("already taken");
    expect(friendlyError({ code: "23505", message: 'duplicate key value violates unique constraint "clients_org_phone_key"' })).toContain("phone number");
  });
  it("maps permission errors and hides everything else", () => {
    expect(friendlyError({ code: "42501", message: "new row violates row-level security policy" })).toContain("permission");
    expect(friendlyError({ code: "XX000", message: "relation public.secret_table does not exist" })).toBe(GENERIC_ERROR);
    expect(friendlyError(null)).toBe(GENERIC_ERROR);
  });
});

describe("staysOverlap", () => {
  const boarding = (startDate: string, endDate: string) => ({ kind: "boarding" as const, startDate, endDate });
  const daycare = (startDate: string, endDate: string) => ({ kind: "daycare" as const, startDate, endDate });
  it("matches the database's kennel rule", () => {
    expect(staysOverlap(boarding("2027-04-14", "2027-04-17"), boarding("2027-04-16", "2027-04-18"))).toBe(true);
    expect(staysOverlap(boarding("2027-04-14", "2027-04-17"), boarding("2027-04-17", "2027-04-19"))).toBe(false); // same-day turnover
    expect(staysOverlap(daycare("2027-04-20", "2027-04-20"), boarding("2027-04-20", "2027-04-22"))).toBe(true); // a day visit holds its day
    expect(staysOverlap(daycare("2027-04-20", "2027-04-20"), boarding("2027-04-21", "2027-04-22"))).toBe(false);
    expect(staysOverlap(daycare("2027-07-05", "2027-07-07"), daycare("2027-07-07", "2027-07-07"))).toBe(true); // day boarding holds its last day
    expect(staysOverlap(boarding("2027-07-05", "2027-07-07"), daycare("2027-07-07", "2027-07-07"))).toBe(false);
  });
});

describe("friendlyError in another language", () => {
  const hi = { language: "hi" as const, m: { errors: { ...en.errors, codes: { ...en.errors.codes, WB020: "{date} को जगह नहीं ({booked} बुक, {kennels} कमरे)", WB022: "सिर्फ़ मालिक या मैनेजर" } } } };
  it("translates a WB code, keeping the date and counts", () => {
    expect(friendlyError({ message: "WB020: no space on 2027-04-14 (3 booked, 2 kennels)" }, hi)).toBe("2027-04-14 को जगह नहीं (3 बुक, 2 कमरे)");
    expect(friendlyError({ message: "WB022: only an owner or manager can change the price or the kind of stay" }, hi)).toBe("सिर्फ़ मालिक या मैनेजर");
  });
  it("has a translation for every code the database raises", async () => {
    const { readFileSync } = await import("node:fs");
    const codes = new Set([...readFileSync("docs/reference/error-codes.md", "utf8").matchAll(/\| `(WB\d{3})` \|/g)].map((m) => m[1]));
    expect([...codes].filter((c) => !(c in en.errors.codes))).toEqual([]);
  });
});
