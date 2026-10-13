import { describe, expect, it } from "vitest";
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
