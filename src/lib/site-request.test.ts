import { describe, expect, it } from "vitest";
import { DEFAULT_PORTIONS } from "@/lib/core";
import { bookingPayload, foodPayload, isWebsiteOrigin, looksLikeRobot, originAllowed, SiteRequest, sourceText } from "./site-request";

const services = [
  { id: "9b2f6a5e-3c1d-4e8f-a7b6-1d2c3e4f5a6b", kind: "grooming" },
  { id: "1a2b3c4d-5e6f-4a1b-8c2d-3e4f5a6b7c8d", kind: "swimming" },
];
const kennel = { country: "IN", services, portions: DEFAULT_PORTIONS };

const request = (over: Record<string, unknown> = {}) =>
  SiteRequest.parse({
    v: 1,
    kind: "booking",
    ref: "WEB-261025-7KQ2",
    hp: "",
    elapsed_ms: 40000,
    parent: { name: "Asha Rao", phone: "98450 12345", area: "Hebbal", address: "12 First Cross", postal_code: "560 024" },
    pet: { name: "Bruno", breed: "Indie", weight_kg: 20, vaccinated: true, notes: "Scared of thunder", avoid_foods: "Chicken" },
    booking: { service: "boarding", start_date: "2026-11-02", end_date: "2026-11-05", pickup: true, notes: "Please call first" },
    food: { kind: "subscription", plan: "full", slot: "evening", note: "Gate code 12" },
    consent: true,
    consent_text: "I agree to the terms",
    source: { page: "/book", utm_source: "instagram", utm_campaign: "launch" },
    ...over,
  });

describe("isWebsiteOrigin", () => {
  it("is https:// and a name with nothing after it, as the database checks", () => {
    for (const ok of ["https://example.com", "https://www.example.co.in", "https://shop.example.com:8443", "http://localhost:8080", "http://localhost"]) expect(isWebsiteOrigin(ok), ok).toBe(true);
    for (const bad of ["https://example.com/", "https://example.com/book", "http://example.com", "javascript:alert(1)", "https://EXAMPLE.com", "https://example", "example.com"]) expect(isWebsiteOrigin(bad), bad).toBe(false);
  });
});

describe("originAllowed", () => {
  it("lets in the kennel's website, with or without www, and nothing else", () => {
    expect(originAllowed("https://example.com", "https://example.com")).toBe(true);
    expect(originAllowed("https://www.example.com", "https://example.com")).toBe(true);
    expect(originAllowed("https://example.com", "https://www.example.com")).toBe(true);
    expect(originAllowed("https://EXAMPLE.com", "https://example.com")).toBe(true);
    expect(originAllowed("https://example.com.evil.test", "https://example.com")).toBe(false);
    expect(originAllowed("https://evil.test", "https://example.com")).toBe(false);
    expect(originAllowed("http://example.com", "https://example.com")).toBe(false);
    expect(originAllowed("http://localhost:8080", "http://localhost:8080")).toBe(true);
    expect(originAllowed(null, "https://example.com")).toBe(false);
    expect(originAllowed("https://example.com", null)).toBe(false);
  });
});

describe("SiteRequest", () => {
  it("cuts text to its length, drops control characters and ignores what it does not know", () => {
    const r = request({ parent: { name: `  Asha\u0000 ${"x".repeat(300)}`, phone: "9845012345" }, extra: "ignored", ref: "<script>" });
    expect(r.parent?.name?.startsWith("Asha  x")).toBe(true);
    expect(r.parent?.name).toHaveLength(120);
    expect(r.ref).toBeNull();
    expect("extra" in r).toBe(false);
  });

  it("refuses a request that is not this format", () => {
    expect(SiteRequest.safeParse({ v: 2, kind: "booking" }).success).toBe(false);
    expect(SiteRequest.safeParse({ v: 1, kind: "delete" }).success).toBe(false);
  });
});

describe("looksLikeRobot", () => {
  it("is true for the hidden field filled or a form sent too fast", () => {
    expect(looksLikeRobot({ hp: "", elapsed_ms: 40000 })).toBe(false);
    expect(looksLikeRobot({ hp: null, elapsed_ms: null })).toBe(false);
    expect(looksLikeRobot({ hp: "http://spam.test", elapsed_ms: 40000 })).toBe(true);
    expect(looksLikeRobot({ hp: "", elapsed_ms: 900 })).toBe(true);
  });
});

describe("sourceText", () => {
  it("joins the campaign tags it has", () => {
    expect(sourceText({ page: "/", referrer: null, utm_source: "instagram", utm_medium: null, utm_campaign: "launch" })).toBe("instagram / launch");
    expect(sourceText({ page: "/", referrer: null, utm_source: null, utm_medium: null, utm_campaign: null })).toBeNull();
    expect(sourceText(null)).toBeNull();
  });
});

describe("bookingPayload", () => {
  it("makes a stay request with the phone in full, the PIN code and the website's reference", () => {
    const p = bookingPayload(request(), kennel);
    if (typeof p === "string") throw new Error(p);
    expect(p.parent).toMatchObject({ name: "Asha Rao", phone: "+919845012345", postal_code: "560024", address: "12 First Cross" });
    expect(p.pets[0]).toMatchObject({ name: "Bruno", breed: "Indie", weight_kg: "20", allergies: "Chicken", behaviour_notes: "Scared of thunder" });
    expect(p.stay).toEqual({ kind: "boarding", start_date: "2026-11-02", end_date: "2026-11-05", notes: "Please call first" });
    expect(p.request).toEqual({ make: "true", service_id: null, time: null, pickup: "true", vaccinations_ok: "true" });
    expect(p.site).toMatchObject({ ref: "WEB-261025-7KQ2", page: "/book", utm_source: "instagram" });
  });

  it("names the kennel's service for an appointment, for staff to give it a time", () => {
    const p = bookingPayload(request({ booking: { service: "grooming", start_date: "2026-11-02", end_date: "2026-11-09" } }), kennel);
    if (typeof p === "string") throw new Error(p);
    expect(p.request?.service_id).toBe(services[0].id);
    expect(p.request?.time).toBeNull();
    expect([p.stay.start_date, p.stay.end_date]).toEqual(["2026-11-02", "2026-11-02"]);
  });

  it("makes no request for an appointment the kennel does not offer, so staff book it by hand", () => {
    const p = bookingPayload(request({ booking: { service: "party", start_date: "2026-11-02" } }), kennel);
    if (typeof p === "string") throw new Error(p);
    expect(p.request).toBeUndefined();
  });

  it("day boarding is daycare", () => {
    const p = bookingPayload(request({ booking: { service: "daycare", start_date: "2026-11-02" } }), kennel);
    if (typeof p === "string") throw new Error(p);
    expect(p.stay).toMatchObject({ kind: "daycare", end_date: "2026-11-02" });
  });

  it("says what is missing", () => {
    const missing: [Record<string, unknown>, string][] = [
      [{ parent: { name: "A", phone: "9845012345" } }, "name"],
      [{ parent: { name: "Asha", phone: "12345" } }, "phone"],
      [{ pet: { name: "" } }, "pet"],
      [{ booking: null }, "service"],
      [{ booking: { service: "boarding", start_date: "2026-11-05", end_date: "2026-11-02" } }, "dates"],
      [{ booking: { service: "boarding", start_date: null, end_date: "2026-11-05" } }, "dates"],
      [{ consent: false }, "consent"],
      [{ parent: { name: "Asha", phone: "9845012345", postal_code: "012345" } }, "pin"],
    ];
    for (const [over, refusal] of missing) expect(bookingPayload(request(over), kennel), refusal).toBe(refusal);
  });

  it("takes a request with no dates, and pick-up with no address, for staff to settle on the call", () => {
    const p = bookingPayload(request({ parent: { name: "Asha", phone: "9845012345" }, booking: { service: "boarding", pickup: true } }), kennel);
    if (typeof p === "string") throw new Error(p);
    expect([p.stay.start_date, p.stay.end_date, p.request?.pickup, p.parent.address]).toEqual([null, null, "true", null]);
  });
});

describe("foodPayload", () => {
  it("works out the grams a day itself, from the weight and the kennel's portions", () => {
    const p = foodPayload(request({ kind: "food" }), kennel);
    if (typeof p === "string") throw new Error(p);
    // 20 kg is a medium dog: 2.5% of its weight.
    expect(p).toMatchObject({ kind: "subscription", phone: "+919845012345", weight_g: 20000, grams_per_day: 500, slot: "evening", postal_code: "560024" });
    expect(p).toMatchObject({ site_ref: "WEB-261025-7KQ2", site_source: "instagram / launch", note: "Gate code 12", consent_text: "I agree to the terms" });
  });

  it("takes an item with its day and words, and no weight", () => {
    const p = foodPayload(request({ kind: "food", pet: { name: null }, food: { kind: "item", starts_on: "2026-11-04", inscription: "Bruno" } }), kennel);
    if (typeof p === "string") throw new Error(p);
    expect(p).toMatchObject({ kind: "item", pet_name: "Bruno", weight_g: null, grams_per_day: null, starts_on: "2026-11-04", inscription: "Bruno" });
  });

  it("says what is missing", () => {
    const missing: [Record<string, unknown>, string][] = [
      [{ food: null }, "food"],
      [{ pet: { name: "Bruno" } }, "weight"],
      [{ pet: { name: null }, food: { kind: "trial" } }, "pet"],
      [{ food: { kind: "item", inscription: "Bruno" } }, "dates"],
      [{ parent: { name: "Asha", phone: "9845012345", postal_code: "560024" } }, "address"],
      [{ parent: { name: "Asha", phone: "9845012345", address: "12 First Cross", postal_code: "" } }, "pin"],
      [{ consent: null }, "consent"],
    ];
    for (const [over, refusal] of missing) expect(foodPayload(request({ kind: "food", ...over }), kennel), refusal).toBe(refusal);
  });
});
