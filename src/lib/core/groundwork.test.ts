import { describe, expect, it } from "vitest";
import { areaFor, formatKg, isMapLink, normalizePostalCode, offersMore, parseKgToGrams, skillsOffered, weightChange } from "./groundwork";

describe("weights", () => {
  it("reads kilos as whole grams", () => {
    expect(parseKgToGrams("34.5")).toBe(34500);
    expect(parseKgToGrams("34,5")).toBe(34500);
    expect(parseKgToGrams(" 6.55 kg")).toBe(6550);
    expect(parseKgToGrams("0.125")).toBe(125);
    expect(parseKgToGrams("12")).toBe(12000);
  });
  it("refuses what is not a weight", () => {
    for (const bad of ["", "heavy", "0", "-3", "1e9", "200", "34.5555", "34..5"]) expect(parseKgToGrams(bad), bad).toBeNull();
    expect(parseKgToGrams("199.999")).toBe(199999);
  });
  it("shows grams as kilos", () => {
    expect(formatKg(34500)).toBe("34.5");
    expect(formatKg(6550)).toBe("6.55");
    expect(formatKg(12000)).toBe("12");
    expect(formatKg(34500, "de-DE")).toBe("34,5");
  });
  it("counts a loss as negative", () => {
    expect(weightChange(36000, 34500)).toBe(-1500);
  });
});

describe("postal codes and areas", () => {
  it("keeps an Indian PIN code as six digits", () => {
    expect(normalizePostalCode("560 038", "IN")).toBe("560038");
    expect(normalizePostalCode("560-038", "IN")).toBe("560038");
    expect(normalizePostalCode("060038", "IN")).toBeNull();
    expect(normalizePostalCode("56003", "IN")).toBeNull();
  });
  it("keeps other countries' codes in capitals", () => {
    expect(normalizePostalCode("sw1a  1aa", "GB")).toBe("SW1A 1AA");
    expect(normalizePostalCode("x", "GB")).toBeNull();
    expect(normalizePostalCode("not a pin", "GB")).toBeNull();
  });
  it("finds the kennel's area for a code", () => {
    const areas = [{ postal_code: "560038", name: "Indiranagar", delivery_charge_minor: 5000 }];
    expect(areaFor("560038", areas)?.name).toBe("Indiranagar");
    expect(areaFor("560001", areas)).toBeNull();
    expect(areaFor(null, areas)).toBeNull();
  });
  it("takes only https map links", () => {
    expect(isMapLink("https://maps.app.goo.gl/abc")).toBe(true);
    expect(isMapLink("http://maps.example/abc")).toBe(false);
    expect(isMapLink("javascript:alert(1)")).toBe(false);
    expect(isMapLink("not a link")).toBe(false);
  });
});

describe("what the kennel offers", () => {
  const none = { offers_appointments: false, offers_kitchen: false, offers_food_delivery: false, offers_shop: false };
  it("asks about the skills for what is switched on", () => {
    expect(skillsOffered(none)).toEqual([]);
    expect(skillsOffered({ ...none, offers_kitchen: true })).toEqual(["cook"]);
    expect(skillsOffered({ ...none, offers_kitchen: true, offers_food_delivery: true })).toEqual(["cook", "rider"]);
    expect(skillsOffered({ ...none, offers_appointments: true })).toEqual(["groomer", "trainer", "swim_supervisor"]);
  });
  it("knows when anything beyond boarding is on", () => {
    expect(offersMore(none)).toBe(false);
    expect(offersMore({ ...none, offers_appointments: true })).toBe(true);
  });
});
