import { describe, expect, it } from "vitest";
import { appointmentLines, appointmentPrice, freeTimes, localClock, localDate, packageDayDate, unpricedAppointments, type BillableAppointment } from "./appointments";
import { zonedInstant } from "./food";

const bands = { small_dog_max_g: 10_000, medium_dog_max_g: 25_000 };
const pet = { weight_g: 20_000, coat: "double" as const, breed: "Golden Retriever" };

describe("what a pet pays for an appointment", () => {
  it("is the fixed price, or nothing yet on quote", () => {
    expect(appointmentPrice({ pricing: "fixed", price_minor: 80000 }, pet, [], bands)).toBe(80000);
    expect(appointmentPrice({ pricing: "quote", price_minor: 80000 }, pet, [], bands)).toBeNull();
  });

  it("by size, is its band's price from its latest weight, else the service's own", () => {
    const prices = [
      { size: "small" as const, coat: null, breed: null, price_minor: 50000 },
      { size: "medium" as const, coat: null, breed: null, price_minor: 70000 },
    ];
    const s = { pricing: "by_size" as const, price_minor: 90000 };
    expect(appointmentPrice(s, pet, prices, bands)).toBe(70000);
    expect(appointmentPrice(s, { ...pet, weight_g: 9000 }, prices, bands)).toBe(50000);
    expect(appointmentPrice(s, { ...pet, weight_g: 30000 }, prices, bands)).toBe(90000);
    expect(appointmentPrice(s, { ...pet, weight_g: null }, prices, bands)).toBe(90000);
  });

  it("by coat, is its breed's price, else its coat's, else the service's own", () => {
    const prices = [
      { size: null, coat: "double" as const, breed: null, price_minor: 120000 },
      { size: null, coat: null, breed: " golden retriever ", price_minor: 150000 },
    ];
    const s = { pricing: "by_coat" as const, price_minor: 100000 };
    expect(appointmentPrice(s, pet, prices, bands)).toBe(150000);
    expect(appointmentPrice(s, { ...pet, breed: "Husky" }, prices, bands)).toBe(120000);
    expect(appointmentPrice(s, { ...pet, breed: null, coat: "short" }, prices, bands)).toBe(100000);
  });
});

describe("free times", () => {
  const tz = "Asia/Kolkata";
  const at = (time: string) => zonedInstant("2027-04-14", time, tz);
  const base = { day: "2027-04-14", opens: "09:00", closes: "12:00", minutes: 60, cleanup: 30, timeZone: tz, now: at("06:00"), place: [] };

  it("offers every half hour that ends by closing", () => {
    expect(freeTimes(base)).toEqual(["09:00", "09:30", "10:00", "10:30", "11:00"]);
  });

  it("keeps the place free for the clean-up after each appointment, and before the next", () => {
    // A swim 10:00 to 11:00 holds the pool to 11:30. A new one needs its own 30 minutes after it too.
    expect(freeTimes({ ...base, place: [{ start: at("10:00"), end: at("11:30") }] })).toEqual([]);
    expect(freeTimes({ ...base, closes: "13:00", place: [{ start: at("10:00"), end: at("11:30") }] })).toEqual(["11:30", "12:00"]);
    expect(freeTimes({ ...base, minutes: 30, cleanup: 0, place: [{ start: at("10:00"), end: at("11:30") }] })).toEqual(["09:00", "09:30", "11:30"]);
  });

  it("leaves out times the pet or the person is busy, and the past", () => {
    expect(freeTimes({ ...base, pet: [{ start: at("09:00"), end: at("10:00") }] })).toEqual(["10:00", "10:30", "11:00"]);
    expect(freeTimes({ ...base, person: [{ start: at("10:30"), end: at("11:00") }] })).toEqual(["09:00", "09:30", "11:00"]);
    expect(freeTimes({ ...base, now: at("10:00") })).toEqual(["10:30", "11:00"]);
  });

  it("ends by pick-up for a groom before going home", () => {
    expect(freeTimes({ ...base, latestEnd: "11:00" })).toEqual(["09:00", "09:30", "10:00"]);
  });
});

describe("days and times at the kennel", () => {
  it("reads an instant in the kennel's time zone", () => {
    expect(localDate("2027-04-13T20:00:00Z", "Asia/Kolkata")).toBe("2027-04-14");
    expect(localClock("2027-04-14T04:30:00Z", "Asia/Kolkata")).toBe("10:00");
  });

  it("puts a package's appointment on the first, middle or last day", () => {
    expect(packageDayDate("first", "2027-04-10", "2027-04-17")).toBe("2027-04-10");
    expect(packageDayDate("middle", "2027-04-10", "2027-04-17")).toBe("2027-04-13");
    expect(packageDayDate("last", "2027-04-10", "2027-04-17")).toBe("2027-04-17");
  });
});

describe("appointments on a bill", () => {
  const a = (over: Partial<BillableAppointment>): BillableAppointment => ({
    id: "a1", status: "confirmed", starts_at: "2027-04-14T04:30:00Z", service_name: "Full groom", price_minor: 120000, tax_rate_bp: 0, sac_code: null, course_id: null, in_package: false, ...over,
  });

  it("bills confirmed, done and not come, with their add-ons; not requests or cancellations", () => {
    const lines = appointmentLines("Biscuit", [a({}), a({ id: "a2", status: "cancelled" }), a({ id: "a3", status: "requested" })], [
      { appointment_id: "a1", description: "Nail trim", quantity: 1, unit_price_minor: 20000, tax_rate_bp: 0, sac_code: null },
      { appointment_id: "a2", description: "Nail trim", quantity: 1, unit_price_minor: 20000, tax_rate_bp: 0, sac_code: null },
    ], "Asia/Kolkata");
    expect(lines.map((l) => [l.description, l.quantity, l.unitPriceMinor])).toEqual([
      ["Full groom for Biscuit (14 Apr, 10:00)", 1, 120000],
      ["Nail trim for Biscuit (14 Apr, 10:00)", 1, 20000],
    ]);
  });

  it("leaves out a course or package session, paid for already, but keeps its add-ons", () => {
    const lines = appointmentLines("Biscuit", [a({ course_id: "c1", price_minor: 0 }), a({ id: "a2", in_package: true, price_minor: 0 })], [
      { appointment_id: "a2", description: "Nail trim", quantity: 1, unit_price_minor: 20000, tax_rate_bp: 0, sac_code: null },
    ], "Asia/Kolkata");
    expect(lines.map((l) => l.description)).toEqual(["Nail trim for Biscuit (14 Apr, 10:00)"]);
  });

  it("finds an appointment on quote with no price yet, which stops the bill", () => {
    expect(unpricedAppointments([a({ price_minor: null }), a({ id: "a2", price_minor: null, status: "requested" })]).map((x) => x.id)).toEqual(["a1"]);
  });
});
