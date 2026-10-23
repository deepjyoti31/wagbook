import { describe, expect, it } from "vitest";
import { MESSAGES } from "@/messages";
import { ALERT_KINDS, alertText, isAlertKind } from "./alerts";

describe("alerts", () => {
  it("has a sentence for every kind, in every language, naming the pet", () => {
    for (const m of Object.values(MESSAGES)) {
      for (const kind of ALERT_KINDS) {
        const t = alertText(m, { kind, kennel: "Happy Tails", pet_name: "Bruno" });
        expect(t.title).toBe("Happy Tails");
        expect(t.body.length).toBeGreaterThan(5);
        expect(t.body).not.toContain("{");
        if (kind !== "intake_form") expect(t.body).toContain("Bruno");
      }
    }
  });

  it("says a pet when there is no name, and knows its kinds", () => {
    expect(alertText(MESSAGES.en, { kind: "food_order", kennel: "K", pet_name: null }).body).toContain(MESSAGES.en.alerts.somePet);
    expect(isAlertKind("incident")).toBe(true);
    expect(isAlertKind("drop table")).toBe(false);
  });
});
