import { describe, expect, it } from "vitest";
import { vaccinationStatus, vaccinationWarnings } from "./vaccinations";

describe("vaccination status", () => {
  it("is expired, expiring within 30 days, valid, or undated", () => {
    expect(vaccinationStatus("2027-04-13", "2027-04-14")).toBe("expired");
    expect(vaccinationStatus("2027-04-14", "2027-04-14")).toBe("expires_soon");
    expect(vaccinationStatus("2027-05-14", "2027-04-14")).toBe("expires_soon");
    expect(vaccinationStatus("2027-05-15", "2027-04-14")).toBe("valid");
    expect(vaccinationStatus(null, "2027-04-14")).toBe("no_date");
  });
});

describe("vaccination warnings for a stay", () => {
  const stay = { startDate: "2027-04-14", endDate: "2027-04-20" };
  it("warns when nothing is on record", () => {
    expect(vaccinationWarnings([], stay)).toEqual([{ vaccine: null, kind: "none_on_record", date: null }]);
  });
  it("warns about a lapsed vaccine and one that lapses before the pet goes home, not one valid to the last day", () => {
    expect(
      vaccinationWarnings(
        [
          { vaccine: "rabies", valid_until: "2027-04-01" },
          { vaccine: "dhppil", valid_until: "2027-04-18" },
          { vaccine: "kennel cough", valid_until: "2027-04-20" },
          { vaccine: "lepto", valid_until: null },
        ],
        stay,
      ),
    ).toEqual([
      { vaccine: "rabies", kind: "expired_before_arrival", date: "2027-04-01" },
      { vaccine: "dhppil", kind: "runs_out_during_stay", date: "2027-04-18" },
    ]);
  });
  it("counts the latest record of a vaccine given more than once", () => {
    expect(
      vaccinationWarnings(
        [
          { vaccine: "Rabies", valid_until: "2026-04-01" },
          { vaccine: "rabies", valid_until: "2028-04-01" },
        ],
        stay,
      ),
    ).toEqual([]);
  });
});
