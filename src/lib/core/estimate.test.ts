import { describe, expect, it } from "vitest";
import { bookingEstimate, type EstimatePrices } from "./estimate";

const prices: EstimatePrices = {
  boarding: 120000,
  daycare: 60000,
  services: [
    { id: "swim", price_minor: 50000, from: false },
    { id: "groom", price_minor: 90000, from: true },
    { id: "train", price_minor: null, from: false },
  ],
};

describe("booking form estimate", () => {
  it("prices boarding by the night, at least one", () => {
    expect(bookingEstimate({ what: "boarding", start: "2027-04-10", end: "2027-04-13" }, prices)).toEqual({ minor: 360000, units: 3, from: false });
    expect(bookingEstimate({ what: "boarding", start: "2027-04-10", end: "2027-04-10" }, prices)).toEqual({ minor: 120000, units: 1, from: false });
    expect(bookingEstimate({ what: "boarding", start: "2027-04-10", end: "2027-04-13" }, prices, 2)).toEqual({ minor: 720000, units: 3, from: false });
  });

  it("prices daycare by the day, both ends counted", () => {
    expect(bookingEstimate({ what: "daycare", start: "2027-04-10", end: "2027-04-12" }, prices)).toEqual({ minor: 180000, units: 3, from: false });
    expect(bookingEstimate({ what: "daycare", start: "2027-04-10", end: null }, prices)).toEqual({ minor: 60000, units: 1, from: false });
  });

  it("gives nothing without a date, with dates the wrong way round, or without a usual price", () => {
    expect(bookingEstimate({ what: "boarding", start: null, end: null }, prices)).toBeNull();
    expect(bookingEstimate({ what: "boarding", start: "2027-04-13", end: "2027-04-10" }, prices)).toBeNull();
    expect(bookingEstimate({ what: "boarding", start: "2027-04-10", end: "2027-04-13" }, { ...prices, boarding: null })).toBeNull();
    expect(bookingEstimate({ what: "nothing", start: "2027-04-10", end: null }, prices)).toBeNull();
  });

  it("prices an appointment by its service: from, when it depends on the dog, and on quote", () => {
    expect(bookingEstimate({ what: "swim", start: "2027-04-10", end: null }, prices)).toEqual({ minor: 50000, units: 1, from: false });
    expect(bookingEstimate({ what: "groom", start: null, end: null }, prices)).toEqual({ minor: 90000, units: 1, from: true });
    expect(bookingEstimate({ what: "train", start: null, end: null }, prices)).toEqual({ quote: true });
  });
});
