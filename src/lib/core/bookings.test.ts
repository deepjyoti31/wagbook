import { describe, expect, it } from "vitest";
import { freeKennels, petMatches, stayFromForm, type KennelHold } from "./bookings";

describe("the stay a booking form describes", () => {
  it("reads an empty check-out as one day of day boarding", () => {
    expect(stayFromForm("daycare", "2027-04-14", "")).toEqual({ kind: "daycare", startDate: "2027-04-14", endDate: "2027-04-14" });
  });
  it("is not a stay until boarding has a night", () => {
    expect(stayFromForm("boarding", "2027-04-14", "")).toBeNull();
    expect(stayFromForm("boarding", "2027-04-14", "2027-04-14")).toBeNull();
    expect(stayFromForm("boarding", "2027-04-14", "2027-04-15")).toEqual({ kind: "boarding", startDate: "2027-04-14", endDate: "2027-04-15" });
  });
  it("refuses dates out of order, half typed dates and unknown kinds", () => {
    expect(stayFromForm("daycare", "2027-04-14", "2027-04-13")).toBeNull();
    expect(stayFromForm("boarding", "2027-04", "2027-04-15")).toBeNull();
    expect(stayFromForm("grooming", "2027-04-14", "2027-04-15")).toBeNull();
  });
});

describe("free kennels", () => {
  const kennels = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const holds: KennelHold[] = [
    { kennelId: "a", kind: "boarding", startDate: "2027-04-14", endDate: "2027-04-17" },
    { kennelId: "b", kind: "daycare", startDate: "2027-04-17", endDate: "2027-04-17" },
  ];
  it("offers every kennel until the dates make a stay", () => {
    expect(freeKennels(kennels, holds, null).map((k) => k.id)).toEqual(["a", "b", "c"]);
  });
  it("leaves out kennels held on any day of the stay", () => {
    const stay = { kind: "boarding", startDate: "2027-04-16", endDate: "2027-04-18" } as const;
    expect(freeKennels(kennels, holds, stay).map((k) => k.id)).toEqual(["c"]);
  });
  it("lets a stay start on the day a boarding stay checks out, as the database does", () => {
    const stay = { kind: "boarding", startDate: "2027-04-17", endDate: "2027-04-19" } as const;
    expect(freeKennels(kennels, holds, stay).map((k) => k.id)).toEqual(["a", "c"]);
  });
  it("counts day boarding as holding its kennel all of its last day", () => {
    const stay = { kind: "boarding", startDate: "2027-04-15", endDate: "2027-04-17" } as const;
    expect(freeKennels(kennels, holds, stay).map((k) => k.id)).toEqual(["b", "c"]);
    const next = { kind: "boarding", startDate: "2027-04-18", endDate: "2027-04-19" } as const;
    expect(freeKennels(kennels, holds, next).map((k) => k.id)).toEqual(["a", "b", "c"]);
  });
});

describe("finding a pet", () => {
  const bruno = { name: "Bruno", breed: "Indie", parentName: "Asha Rao", parentPhone: "+919876543210" };
  it("matches name, breed and parent, in any case and order", () => {
    expect(petMatches(bruno, "bru")).toBe(true);
    expect(petMatches(bruno, "indie")).toBe(true);
    expect(petMatches(bruno, "rao bruno")).toBe(true);
    expect(petMatches(bruno, "rao milo")).toBe(false);
  });
  it("matches three or more digits anywhere in the parent's phone", () => {
    expect(petMatches(bruno, "98765")).toBe(true);
    expect(petMatches(bruno, "98765 43210")).toBe(true);
    expect(petMatches(bruno, "11111")).toBe(false);
  });
  it("matches everything when the box is empty, and copes with no breed or parent", () => {
    expect(petMatches(bruno, "  ")).toBe(true);
    expect(petMatches({ name: "Milo", breed: null, parentName: null, parentPhone: null }, "milo")).toBe(true);
    expect(petMatches({ name: "Milo", breed: null, parentName: null, parentPhone: null }, "987")).toBe(false);
  });
});
