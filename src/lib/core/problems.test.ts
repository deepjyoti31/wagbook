import { describe, expect, it } from "vitest";
import { isControlFlow, scrubErrorText } from "./problems";

describe("scrubErrorText", () => {
  it("takes out email addresses and phone numbers, and keeps short numbers", () => {
    expect(scrubErrorText("Could not book for asha@example.in on +91 98765 43210 (row 4)")).toBe("Could not book for [email] on [number] (row 4)");
    expect(scrubErrorText("call 080-2345-6789 or 9876543210")).toBe("call [number] or [number]");
    expect(scrubErrorText("WB020: kennel K02 is taken from 2026-10-22")).toBe("WB020: kennel K02 is taken from 2026-10-22");
  });

  it("keeps at most 300 characters", () => {
    expect(scrubErrorText("x".repeat(400))).toHaveLength(300);
  });
});

describe("isControlFlow", () => {
  it("knows Next.js's redirects and not-found from real errors", () => {
    expect(isControlFlow("NEXT_REDIRECT;replace;/login;307;")).toBe(true);
    expect(isControlFlow("NEXT_HTTP_ERROR_FALLBACK;404")).toBe(true);
    expect(isControlFlow("2786543210")).toBe(false);
    expect(isControlFlow(undefined)).toBe(false);
  });
});
