import { describe, expect, it } from "vitest";
import { isLate } from "./care";

describe("late care tasks", () => {
  it("calls a task late more than half an hour past its time", () => {
    expect(isLate("09:00:00", "09:31")).toBe(true);
    expect(isLate("09:00", "13:00")).toBe(true);
  });

  it("gives half an hour of grace, and never calls a later task late", () => {
    expect(isLate("09:00:00", "09:30")).toBe(false);
    expect(isLate("09:00:00", "08:00")).toBe(false);
  });

  it("never calls a task with no time late", () => {
    expect(isLate(null, "23:59")).toBe(false);
  });
});
