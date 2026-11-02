import { describe, expect, it } from "vitest";
import { MESSAGES } from "@/messages";
import { activeHref, MENU_LINKS, menuFor } from "./menu";

const nothing = { offers_appointments: false, offers_kitchen: false, offers_food_delivery: false, offers_shop: false, keeps_rota: false };
const everything = { offers_appointments: true, offers_kitchen: true, offers_food_delivery: true, offers_shop: true, keeps_rota: true };

describe("menuFor", () => {
  it("keeps reports, expenses, history and upkeep from staff", () => {
    const staff = menuFor(everything, false).map((l) => l.key);
    expect(staff).not.toContain("reports");
    expect(staff).not.toContain("expenses");
    expect(staff).not.toContain("history");
    expect(staff).not.toContain("import");
    expect(menuFor(everything, true).map((l) => l.key)).toContain("reports");
  });

  it("shows a link for what the kennel offers only while it offers it", () => {
    const plain = menuFor(nothing, true).map((l) => l.key);
    for (const key of ["appointments", "kitchen", "food", "shop", "orders", "rota", "leave", "attendance", "areas", "appointmentSetup"] as const) {
      expect(plain).not.toContain(key);
    }
    expect(menuFor(everything, true)).toHaveLength(MENU_LINKS.length);
  });

  it("has words for every link and group in English", () => {
    for (const l of MENU_LINKS) {
      expect(MESSAGES.en.more.links[l.key].title).toBeTruthy();
      expect(MESSAGES.en.more.groups[l.group]).toBeTruthy();
    }
  });
});

describe("activeHref", () => {
  const hrefs = ["/app", "/app/bookings", "/app/calendar", "/app/more", "/app/more/intake", "/app/bills"];

  it("treats Today as itself only", () => {
    expect(activeHref("/app", hrefs)).toBe("/app");
    expect(activeHref("/app/care", hrefs)).toBeNull();
  });

  it("picks the longest link the path is under", () => {
    expect(activeHref("/app/more/intake", hrefs)).toBe("/app/more/intake");
    expect(activeHref("/app/more/intake/abc", hrefs)).toBe("/app/more/intake");
    expect(activeHref("/app/more/settings", hrefs)).toBe("/app/more");
    expect(activeHref("/app/bookings/new", hrefs)).toBe("/app/bookings");
  });

  it("does not match a link that only shares the start of a word", () => {
    expect(activeHref("/app/billsx", hrefs)).toBeNull();
  });
});
