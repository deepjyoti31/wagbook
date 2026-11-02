import { describe, expect, it } from "vitest";
import { bodyLimitFor, clientAddress, RateLimiter, rateRuleFor } from "./rate-limit";

describe("RateLimiter", () => {
  it("lets the limit through in a window, then refuses, then starts again", () => {
    const r = new RateLimiter();
    const hits = Array.from({ length: 4 }, () => r.hit("a", 3, 1000, 0));
    expect(hits).toEqual([true, true, true, false]);
    expect(r.hit("a", 3, 1000, 999)).toBe(false);
    expect(r.hit("a", 3, 1000, 1000)).toBe(true);
  });

  it("counts each key on its own", () => {
    const r = new RateLimiter();
    expect(r.hit("a", 1, 1000, 0)).toBe(true);
    expect(r.hit("a", 1, 1000, 1)).toBe(false);
    expect(r.hit("b", 1, 1000, 1)).toBe(true);
  });

  it("keeps memory bounded by forgetting the oldest windows", () => {
    const r = new RateLimiter(100);
    for (let i = 0; i < 1000; i++) r.hit(`k${i}`, 5, 60_000, i);
    expect(r.size).toBe(100);
    // The newest are still counted.
    for (let i = 0; i < 5; i++) r.hit("k999", 5, 60_000, 1000);
    expect(r.hit("k999", 5, 60_000, 1000)).toBe(false);
  });
});

describe("rateRuleFor", () => {
  it("covers the forms strangers can post, and nothing signed in but the password", () => {
    expect(rateRuleFor("/login")?.name).toBe("sign-in");
    expect(rateRuleFor("/login/code")?.name).toBe("sign-in");
    expect(rateRuleFor("/login/forgot")?.name).toBe("sign-in");
    expect(rateRuleFor("/login/new-password")?.name).toBe("sign-in");
    expect(rateRuleFor("/app/more/password")?.name).toBe("password");
    expect(rateRuleFor("/i/happy-tails")?.name).toBe("intake");
    expect(rateRuleFor("/f/happy-tails")?.name).toBe("food");
    expect(rateRuleFor("/join/abc")?.name).toBe("join");
    expect(rateRuleFor("/b/abc")?.name).toBe("requests");
    expect(rateRuleFor("/book/happy-tails")?.name).toBe("booking");
    expect(rateRuleFor("/api/site/happy-tails")?.name).toBe("site");
    expect(rateRuleFor("/api/health")).toBeNull();
    expect(rateRuleFor("/app")).toBeNull();
    expect(rateRuleFor("/app/bookings/new")).toBeNull();
    expect(rateRuleFor("/loginx")).toBeNull();
  });
});

describe("bodyLimitFor", () => {
  it("allows files only where files are sent", () => {
    expect(bodyLimitFor("/app/bookings/1/update")).toBe(12 * 1024 * 1024);
    expect(bodyLimitFor("/i/happy-tails")).toBe(12 * 1024 * 1024);
    expect(bodyLimitFor("/rider")).toBe(12 * 1024 * 1024);
    expect(bodyLimitFor("/b/abc")).toBe(12 * 1024 * 1024);
    expect(bodyLimitFor("/book/happy-tails")).toBe(1024 * 1024);
    expect(bodyLimitFor("/f/happy-tails")).toBe(1024 * 1024);
    expect(bodyLimitFor("/login")).toBe(1024 * 1024);
    expect(bodyLimitFor("/join/abc")).toBe(1024 * 1024);
    expect(bodyLimitFor("/application")).toBe(1024 * 1024);
  });
});

describe("clientAddress", () => {
  it("prefers the address the host reports, then the first forwarded one", () => {
    expect(clientAddress(new Headers({ "x-real-ip": "1.2.3.4", "x-forwarded-for": "5.6.7.8" }))).toBe("1.2.3.4");
    expect(clientAddress(new Headers({ "x-forwarded-for": "5.6.7.8, 10.0.0.1" }))).toBe("5.6.7.8");
    expect(clientAddress(new Headers())).toBe("unknown");
  });
});
