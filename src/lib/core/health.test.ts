import { describe, expect, it } from "vitest";
import { addMonths, healthProblems } from "./health";

const rules = { required: [{ vaccine: "Rabies", months_valid: 12 }, { vaccine: "kennel_cough", months_valid: 6 }], deworm_days: 90, tick_days: 30, neuter_months: 12 };
const pet = {
  date_of_birth: "2026-01-10",
  is_neutered: true,
  dewormed_on: "2027-03-01",
  tick_treated_on: "2027-04-20",
  vaccinations: [
    { vaccine: "rabies", given_on: null, valid_until: "2028-01-01" },
    { vaccine: "Kennel cough", given_on: "2026-11-15", valid_until: null },
  ],
};

describe("health papers at the door (M40)", () => {
  it("finds nothing lacking when everything is in date", () => {
    expect(healthProblems(pet, rules, "2027-04-14")).toEqual([]);
  });

  it("counts a card with no end date from the day given, by the vaccine's months", () => {
    // Given 15 November 2026, lasts six months: to 14 May 2027.
    expect(healthProblems(pet, rules, "2027-05-14")).toEqual([]);
    expect(healthProblems(pet, rules, "2027-05-15")).toEqual([{ problem: "vaccine", vaccine: "kennel_cough" }]);
  });

  it("asks for deworming, tick treatment and neutering by the kennel's days and age", () => {
    expect(healthProblems({ ...pet, dewormed_on: null, is_neutered: false }, rules, "2027-04-14")).toEqual([{ problem: "deworming" }, { problem: "neutering" }]);
    // A puppy under a year, or of unknown age, is not held to the age.
    expect(healthProblems({ ...pet, is_neutered: false, date_of_birth: "2026-06-01" }, rules, "2027-04-14")).toEqual([]);
    expect(healthProblems({ ...pet, is_neutered: null, date_of_birth: null }, rules, "2027-04-14")).toEqual([]);
  });

  it("adds months as the database does", () => {
    expect(addMonths("2027-01-31", 1)).toBe("2027-02-28");
    expect(addMonths("2026-11-15", 6)).toBe("2027-05-15");
  });
});
