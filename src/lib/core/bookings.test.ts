import { describe, expect, it } from "vitest";
import { freeKennels, payFromPacks, petMatches, seriesDates, sharedWith, stayFromForm, type KennelHold } from "./bookings";

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

describe("free kennels for a family", () => {
  const kennels = [{ id: "a" }, { id: "b" }];
  const stay = { kind: "boarding", startDate: "2027-05-02", endDate: "2027-05-04" } as const;
  const sibling: KennelHold = { kennelId: "a", kind: "boarding", startDate: "2027-05-01", endDate: "2027-05-05", clientId: "p1" };

  it("offers a kennel a sibling holds while it has room for one more", () => {
    expect(freeKennels(kennels, [sibling], stay, { clientId: "p1" }).map((k) => k.id)).toEqual(["a", "b"]);
  });
  it("never offers it to another parent, or when the parent is not known", () => {
    expect(freeKennels(kennels, [sibling], stay, { clientId: "p2" }).map((k) => k.id)).toEqual(["b"]);
    expect(freeKennels(kennels, [sibling], stay).map((k) => k.id)).toEqual(["b"]);
  });
  it("offers only empty kennels to two pets sharing", () => {
    expect(freeKennels(kennels, [sibling], stay, { clientId: "p1", pets: 2 }).map((k) => k.id)).toEqual(["b"]);
  });
  it("never offers a kennel that already holds two on any day of the stay", () => {
    const second: KennelHold = { ...sibling, startDate: "2027-05-03", endDate: "2027-05-04" };
    expect(freeKennels(kennels, [sibling, second], stay, { clientId: "p1" }).map((k) => k.id)).toEqual(["b"]);
    // Once the second has gone home on the 4th, there is room again from that day.
    const later = { kind: "boarding", startDate: "2027-05-04", endDate: "2027-05-05" } as const;
    expect(freeKennels(kennels, [sibling, second], later, { clientId: "p1" }).map((k) => k.id)).toEqual(["a", "b"]);
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

describe("who a kennel would be shared with", () => {
  const stay = { id: "me", clientId: "p1", kind: "boarding", startDate: "2027-05-02", endDate: "2027-05-04" } as const;
  it("names the parent's other pets in kennels held on the stay's days, and nobody else", () => {
    const holds = [
      { id: "me", kennelId: "a", clientId: "p1", kind: "boarding", startDate: "2027-05-02", endDate: "2027-05-04", petName: "Me" },
      { id: "b1", kennelId: "a", clientId: "p1", kind: "boarding", startDate: "2027-05-01", endDate: "2027-05-03", petName: "Bruno" },
      { id: "b2", kennelId: "b", clientId: "p2", kind: "boarding", startDate: "2027-05-01", endDate: "2027-05-03", petName: "Stranger" },
      { id: "b3", kennelId: "c", clientId: "p1", kind: "boarding", startDate: "2027-05-04", endDate: "2027-05-06", petName: "Later" },
    ] as const;
    expect([...sharedWith(stay, holds)]).toEqual([["a", ["Bruno"]]]);
  });
});

describe("repeating day boarding", () => {
  it("lists the chosen weekdays between two dates", () => {
    // 5 April 2027 is a Monday.
    expect(seriesDates("2027-04-05", "2027-04-18", [1, 3])).toEqual(["2027-04-05", "2027-04-07", "2027-04-12", "2027-04-14"]);
    expect(seriesDates("2027-04-05", "2027-04-05", [1])).toEqual(["2027-04-05"]);
    expect(seriesDates("2027-04-05", "2027-04-04", [1])).toBeNull();
    expect(seriesDates("2027-04-06", "2027-04-06", [1])).toBeNull();
    expect(seriesDates("2027-04-05", "2027-04-18", [])).toBeNull();
    expect(seriesDates("2027-04-05", "2027-04-18", [7])).toBeNull();
    expect(seriesDates("2027-01-01", "2027-12-31", [0, 1, 2, 3, 4, 5, 6])).toBeNull();
  });

  it("pays each day from the pack that ends soonest and covers it, while it has days", () => {
    const packs = [
      { id: "late", startsOn: "2027-04-01", validUntil: "2027-05-31", daysLeft: 5 },
      { id: "soon", startsOn: "2027-04-01", validUntil: "2027-04-10", daysLeft: 1 },
    ];
    expect(payFromPacks(["2027-04-05", "2027-04-07", "2027-04-12"], packs)).toEqual(["soon", "late", "late"]);
    expect(payFromPacks(["2027-06-01"], packs)).toEqual([null]);
    // Two pets a day take two days.
    expect(payFromPacks(["2027-04-05", "2027-04-06"], [{ id: "p", startsOn: "2027-04-01", validUntil: "2027-04-30", daysLeft: 3 }], 2)).toEqual(["p", null]);
  });
});
