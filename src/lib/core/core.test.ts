import { describe, expect, it } from "vitest";
import {
  addDays, amountInWords, billMessage, bookingConfirmedMessage, chargeableUnits, computeInvoice, computeLine,
  diffDays, eachDate, fiscalYear, formatInvoiceNumber, formatMoney, formatPhone, gstinStateCode, isISODate,
  isValidGstin, isValidVpa, nightsBetween, normalizePhone, numberToIndianWords, parseMoney, planPlaySessions,
  quoteStay, todayIn, toDecimalString, upiLink, whatsappLink, yardsNeeded,
  calendarDays, calendarGrid, isOverstaying, peaksTouching, playMinutesOn, playWindows,
} from "./index";

describe("dates", () => {
  it("validates ISO dates strictly", () => {
    expect(isISODate("2027-04-14")).toBe(true);
    expect(isISODate("2027-02-30")).toBe(false);
    expect(isISODate("14-04-2027")).toBe(false);
    expect(isISODate(null)).toBe(false);
  });
  it("adds and subtracts days across months and leap years", () => {
    expect(addDays("2027-12-31", 1)).toBe("2028-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(diffDays("2027-04-14", "2027-04-17")).toBe(3);
    expect(eachDate("2027-04-29", "2027-05-02")).toEqual(["2027-04-29", "2027-04-30", "2027-05-01"]);
  });
  it("knows that today depends on the time zone", () => {
    const instant = new Date("2027-04-13T20:00:00Z"); // 01:30 on the 14th in India
    expect(todayIn("Asia/Kolkata", instant)).toBe("2027-04-14");
    expect(todayIn("America/New_York", instant)).toBe("2027-04-13");
  });
  it("uses India's April to March financial year by default", () => {
    expect(fiscalYear("2027-03-31")).toBe("2026-27");
    expect(fiscalYear("2027-04-01")).toBe("2027-28");
    expect(fiscalYear("2099-12-01")).toBe("2099-00");
    expect(fiscalYear("2027-08-01", 1)).toBe("2027");
  });
});

describe("money", () => {
  it("parses what people type into paise", () => {
    expect(parseMoney("1200")).toBe(120000);
    expect(parseMoney("1,200.50")).toBe(120050);
    expect(parseMoney("₹1,20,000")).toBe(12000000);
    expect(parseMoney("Rs. 99.9")).toBe(9990);
    expect(parseMoney(1200)).toBe(120000);
    expect(parseMoney("12.345")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("")).toBeNull();
  });
  it("formats with Indian digit grouping", () => {
    expect(formatMoney(12000000)).toBe("₹1,20,000.00");
    expect(formatMoney(120000, { trimZeros: true })).toBe("₹1,200");
    expect(formatMoney(120050, { trimZeros: true })).toBe("₹1,200.50");
    expect(toDecimalString(120005)).toBe("1200.05");
  });
  it("refuses floats", () => {
    expect(() => formatMoney(12.5)).toThrow();
  });
});

describe("amount in words", () => {
  it("uses lakh and crore", () => {
    expect(numberToIndianWords(0)).toBe("Zero");
    expect(numberToIndianWords(123456)).toBe("One Lakh Twenty Three Thousand Four Hundred Fifty Six");
    expect(numberToIndianWords(10000000)).toBe("One Crore");
    expect(numberToIndianWords(52300000)).toBe("Five Crore Twenty Three Lakh");
  });
  it("writes rupees and paise", () => {
    expect(amountInWords(120000)).toBe("Rupees One Thousand Two Hundred Only");
    expect(amountInWords(424850)).toBe("Rupees Four Thousand Two Hundred Forty Eight and Fifty Paise Only");
  });
});

describe("phone", () => {
  it("normalises Indian mobiles to E.164", () => {
    for (const typed of ["9876543210", "09876543210", "919876543210", "+91 98765 43210", "+91-98765-43210", "0091 9876543210"]) {
      expect(normalizePhone(typed)).toBe("+919876543210");
    }
  });
  it("rejects numbers that cannot be Indian mobiles", () => {
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("5876543210")).toBeNull();
    expect(normalizePhone("")).toBeNull();
  });
  it("keeps other countries when typed with a plus", () => {
    expect(normalizePhone("+1 415 555 2671")).toBe("+14155552671");
    expect(normalizePhone("4155552671", null)).toBeNull();
  });
  it("formats for reading", () => {
    expect(formatPhone("+919876543210")).toBe("98765 43210");
  });
});

describe("gst", () => {
  it("validates GSTIN shape, state and check character", () => {
    expect(isValidGstin("27AAPFU0939F1ZV")).toBe(true);
    expect(isValidGstin("29AAGCB7383J1Z4")).toBe(true);
    expect(isValidGstin("27aapfu0939f1zv")).toBe(true);
    expect(isValidGstin("27AAPFU0939F1ZX")).toBe(false); // wrong check character
    expect(isValidGstin("99AAPFU0939F1ZV")).toBe(false); // no such state
    expect(isValidGstin("27AAPFU0939F1Z")).toBe(false);
    expect(gstinStateCode("29AAGCB7383J1Z4")).toBe("29");
  });
});

describe("tax", () => {
  const karnataka = { mode: "gst_india" as const, sellerStateCode: "29" };

  it("charges nothing in none mode even if a rate is given", () => {
    const l = computeLine({ description: "x", quantity: 3, unitPriceMinor: 120000, taxRateBp: 1800 }, { mode: "none" });
    expect(l.taxMinor).toBe(0);
    expect(l.totalMinor).toBe(360000);
  });
  it("splits CGST and SGST equally within a state", () => {
    const l = computeLine({ description: "x", quantity: 3, unitPriceMinor: 120000, taxRateBp: 1800 }, karnataka);
    expect(l).toMatchObject({ taxableMinor: 360000, cgstMinor: 32400, sgstMinor: 32400, igstMinor: 0, totalMinor: 424800 });
  });
  it("charges IGST across states", () => {
    const l = computeLine(
      { description: "x", quantity: 1, unitPriceMinor: 120000, taxRateBp: 1800 },
      { ...karnataka, placeOfSupplyStateCode: "27" },
    );
    expect(l).toMatchObject({ cgstMinor: 0, sgstMinor: 0, igstMinor: 21600, totalMinor: 141600 });
  });
  it("backs tax out of inclusive prices without changing what the customer pays", () => {
    const l = computeLine({ description: "x", quantity: 1, unitPriceMinor: 120000, taxRateBp: 1800 }, { ...karnataka, pricesIncludeTax: true });
    expect(l.totalMinor).toBe(120000);
    expect(l.cgstMinor).toBe(l.sgstMinor);
    expect(l.taxableMinor + l.cgstMinor + l.sgstMinor).toBe(120000);
    expect(l.taxableMinor).toBe(101694);
  });
  it("keeps inclusive totals exact for every price from Rs 1 to Rs 3,000", () => {
    for (let rupees = 1; rupees <= 3000; rupees++) {
      const price = rupees * 100;
      for (const ctx of [{ ...karnataka, pricesIncludeTax: true }, { ...karnataka, placeOfSupplyStateCode: "07", pricesIncludeTax: true }, { mode: "simple" as const, pricesIncludeTax: true }]) {
        const l = computeLine({ description: "x", quantity: 1, unitPriceMinor: price, taxRateBp: 1800 }, ctx);
        expect(l.totalMinor).toBe(price);
        expect(l.taxableMinor + l.taxMinor).toBe(price);
        expect(l.cgstMinor).toBe(l.sgstMinor);
      }
    }
  });
  it("takes line discounts off before tax", () => {
    const l = computeLine({ description: "x", quantity: 7, unitPriceMinor: 120000, discountMinor: 84000, taxRateBp: 1800 }, karnataka);
    expect(l.taxableMinor).toBe(756000);
    expect(l.totalMinor).toBe(756000 + 2 * 68040);
    expect(() => computeLine({ description: "x", quantity: 1, unitPriceMinor: 100, discountMinor: 101 }, karnataka)).toThrow();
  });
  it("totals an invoice and can round to a whole rupee", () => {
    const inv = computeInvoice(
      [
        { description: "Boarding", quantity: 3, unitPriceMinor: 99950, taxRateBp: 1800 },
        { description: "Grooming", quantity: 1, unitPriceMinor: 200000, taxRateBp: 1800 },
      ],
      karnataka,
      { roundToWholeUnit: true },
    );
    expect(inv.taxableMinor).toBe(499850);
    expect(inv.taxMinor).toBe(inv.cgstMinor + inv.sgstMinor);
    expect(inv.totalMinor % 100).toBe(0);
    expect(inv.totalMinor - inv.roundOffMinor).toBe(inv.taxableMinor + inv.taxMinor);
    expect(Math.abs(inv.roundOffMinor)).toBeLessThanOrEqual(50);
  });
});

describe("invoice numbers", () => {
  it("formats within the 16 character limit", () => {
    expect(formatInvoiceNumber("WB", "2027-28", 1)).toBe("WB/27-28/0001");
    expect(formatInvoiceNumber("DC", "2027-28", 12345)).toBe("DC/27-28/12345");
    expect(formatInvoiceNumber("KENL", "2027-28", 99999)).toBe("KENL/27-28/99999");
  });
  it("rejects bad prefixes and numbers that grow too long", () => {
    expect(() => formatInvoiceNumber("wb", "2027-28", 1)).toThrow();
    expect(() => formatInvoiceNumber("TOOLONG", "2027-28", 1)).toThrow();
    expect(() => formatInvoiceNumber("KENL", "2027-28", 100000)).toThrow();
    expect(() => formatInvoiceNumber("WB", "2027-28", 0)).toThrow();
  });
});

describe("stays", () => {
  it("counts nights, not days, for boarding", () => {
    expect(nightsBetween("2027-04-14", "2027-04-17")).toBe(3);
    expect(chargeableUnits("boarding", "2027-04-14", "2027-04-17")).toBe(3);
    expect(() => chargeableUnits("boarding", "2027-04-14", "2027-04-14")).toThrow();
    expect(() => nightsBetween("2027-04-17", "2027-04-14")).toThrow();
  });
  it("counts days inclusively for day boarding", () => {
    expect(chargeableUnits("daycare", "2027-04-14", "2027-04-14")).toBe(1);
    expect(chargeableUnits("daycare", "2027-04-14", "2027-04-16")).toBe(3);
  });
  it("quotes a stay with an add-on and no tax", () => {
    const q = quoteStay(
      {
        kind: "boarding", petName: "Bruno", startDate: "2027-04-14", endDate: "2027-04-17", rateMinor: 120000,
        addOns: [{ description: "Grooming", quantity: 1, unitPriceMinor: 200000 }],
      },
      { mode: "none" },
    );
    expect(q.lines).toHaveLength(2);
    expect(q.lines[0].description).toContain("3 nights");
    expect(q.totalMinor).toBe(560000);
  });
});

describe("whatsapp", () => {
  it("builds click-to-chat links", () => {
    expect(whatsappLink("Hi there", "+919876543210")).toBe("https://wa.me/919876543210?text=Hi%20there");
    expect(whatsappLink("Line 1\nLine 2 & more")).toBe("https://wa.me/?text=Line%201%0ALine%202%20%26%20more");
  });
  it("writes the booking and bill messages", () => {
    const booking = bookingConfirmedMessage({
      kennelName: "Happy Tails", parentName: "Asha", petName: "Bruno",
      startDate: "2027-04-14", endDate: "2027-04-17", nights: 3, totalMinor: 360000,
    });
    expect(booking).toContain("14 Apr 2027");
    expect(booking).toContain("₹3,600");
    const bill = billMessage({ kennelName: "Happy Tails", parentName: "Asha", petName: "Bruno", invoiceNumber: "WB/27-28/0001", dueMinor: 360000 });
    expect(bill).toContain("WB/27-28/0001");
  });
});

describe("upi", () => {
  it("validates UPI IDs", () => {
    expect(isValidVpa("happytails@okhdfcbank")).toBe(true);
    expect(isValidVpa("9876543210@ybl")).toBe(true);
    expect(isValidVpa("not a vpa")).toBe(false);
    expect(isValidVpa("name@")).toBe(false);
  });
  it("builds a payment link with a fixed amount", () => {
    expect(upiLink({ vpa: "happytails@okhdfcbank", payeeName: "Happy Tails", amountMinor: 360000, note: "Invoice WB/27-28/0001", reference: "WB/27-28/0001" })).toBe(
      "upi://pay?pa=happytails%40okhdfcbank&pn=Happy%20Tails&am=3600.00&cu=INR&tn=Invoice%20WB%2F27-28%2F0001&tr=WB27280001",
    );
    expect(() => upiLink({ vpa: "bad", payeeName: "x" })).toThrow();
    expect(() => upiLink({ vpa: "a@b1", payeeName: "x", amountMinor: 0 })).toThrow();
  });
});

describe("solo play scheduling", () => {
  const windows = [{ start: "07:00", end: "12:00" }, { start: "15:00", end: "20:00" }];
  const dogs = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `dog-${String(i + 1).padStart(2, "0")}` }));
  const yards = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `yard-${i + 1}` }));

  it("works out how many yards a full house needs", () => {
    expect(yardsNeeded({ dogCount: 60, windows, sessionMinutes: 20, sessionsPerDog: 2 })).toBe(4);
    expect(yardsNeeded({ dogCount: 60, windows, sessionMinutes: 15, sessionsPerDog: 2 })).toBe(3);
    expect(yardsNeeded({ dogCount: 60, windows, sessionMinutes: 20, sessionsPerDog: 2, changeoverMinutes: 5 })).toBe(5);
    expect(yardsNeeded({ dogCount: 1, windows: [{ start: "07:00", end: "07:10" }], sessionMinutes: 20, sessionsPerDog: 1 })).toBeNull();
  });
  it("never puts two dogs in a yard at once and gives every dog its sessions", () => {
    const plan = planPlaySessions({ dogs: dogs(60), yards: yards(4), windows, sessionMinutes: 20, sessionsPerDog: 2, minGapMinutes: 120 });
    expect(plan.shortfall).toEqual([]);
    expect(plan.sessions).toHaveLength(120);
    const seen = new Set<string>();
    for (const s of plan.sessions) {
      const key = `${s.yardId}@${s.start}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    for (const d of dogs(60)) {
      const mine = plan.sessions.filter((s) => s.dogId === d.id).sort((a, b) => a.start.localeCompare(b.start));
      expect(mine).toHaveLength(2);
      expect(mine[1].start >= mine[0].end).toBe(true);
    }
  });
  it("is fair when there is not enough yard time, and says who missed out", () => {
    const plan = planPlaySessions({ dogs: dogs(10), yards: yards(1), windows: [{ start: "07:00", end: "11:00" }], sessionMinutes: 20, sessionsPerDog: 2 });
    expect(plan.slotsAvailable).toBe(12);
    expect(plan.slotsNeeded).toBe(20);
    // Everyone gets one session before anyone gets two.
    for (const d of dogs(10)) expect(plan.sessions.some((s) => s.dogId === d.id)).toBe(true);
    expect(plan.shortfall).toHaveLength(8);
    expect(plan.shortfall.every((s) => s.missing === 1)).toBe(true);
  });
});

describe("bookings", () => {
  const diwali = { name: "Diwali", startDate: "2027-10-28", endDate: "2027-11-02", noRefund: true, playSessionMinutes: 15 };
  const longWeekend = { name: "Long weekend", startDate: "2027-11-01", endDate: "2027-11-03", noRefund: false, playSessionMinutes: 18 };

  it("knows which peak periods a stay touches", () => {
    expect(peaksTouching({ kind: "boarding", startDate: "2027-10-25", endDate: "2027-10-29" }, [diwali, longWeekend])).toEqual([diwali]);
    // Leaving on the first day of the period: no night inside it.
    expect(peaksTouching({ kind: "boarding", startDate: "2027-10-25", endDate: "2027-10-28" }, [diwali])).toEqual([]);
    // Day boarding on that day does touch it.
    expect(peaksTouching({ kind: "daycare", startDate: "2027-10-28", endDate: "2027-10-28" }, [diwali])).toEqual([diwali]);
    expect(peaksTouching({ kind: "boarding", startDate: "2027-11-02", endDate: "2027-11-05" }, [diwali, longWeekend])).toEqual([diwali, longWeekend]);
  });

  it("shortens play to the shortest peak length on a day", () => {
    expect(playMinutesOn("2027-10-20", 20, [diwali, longWeekend])).toBe(20);
    expect(playMinutesOn("2027-10-29", 20, [diwali, longWeekend])).toBe(15);
    expect(playMinutesOn("2027-11-03", 20, [diwali, longWeekend])).toBe(18);
    expect(playMinutesOn("2027-10-29", 20, [{ ...diwali, playSessionMinutes: null }])).toBe(20);
  });

  it("spots a pet that has stayed past its check-out date", () => {
    expect(isOverstaying({ status: "checked_in", endDate: "2027-04-14" }, "2027-04-15")).toBe(true);
    expect(isOverstaying({ status: "checked_in", endDate: "2027-04-15" }, "2027-04-15")).toBe(false);
    expect(isOverstaying({ status: "confirmed", endDate: "2027-04-14" }, "2027-04-15")).toBe(false);
  });

  it("lays stays out on the calendar, freeing a kennel on its check-out day", () => {
    const days = calendarDays("2027-04-14", 4);
    expect(days).toEqual(["2027-04-14", "2027-04-15", "2027-04-16", "2027-04-17"]);
    const a = { id: "a", kennelId: "k1", kind: "boarding" as const, startDate: "2027-04-13", endDate: "2027-04-15" };
    const b = { id: "b", kennelId: "k1", kind: "boarding" as const, startDate: "2027-04-15", endDate: "2027-04-20" };
    const c = { id: "c", kennelId: null, kind: "daycare" as const, startDate: "2027-04-16", endDate: "2027-04-16" };
    const grid = calendarGrid(["k1", "k2"], [a, b, c], days);
    expect(grid.byKennel.get("k1")!.map((x) => x?.id ?? null)).toEqual(["a", "b", "b", "b"]);
    expect(grid.byKennel.get("k2")!.every((x) => x === null)).toBe(true);
    expect(grid.unassigned.map((d) => d.map((x) => x.id))).toEqual([[], [], ["c"], []]);
  });

  it("adds extras to the estimate of a stay", () => {
    const totals = quoteStay(
      {
        kind: "boarding", petName: "Bruno", startDate: "2027-04-14", endDate: "2027-04-17", rateMinor: 120000, discountMinor: 10000,
        addOns: [{ description: "Grooming", quantity: 2, unitPriceMinor: 200000 }, { description: "Pick-up", quantity: 1, unitPriceMinor: 50000 }],
      },
      { mode: "none" },
    );
    expect(totals.lines).toHaveLength(3);
    // 3 nights x 1,200 - 100 discount + 2 x 2,000 grooming + 500 pick-up.
    expect(totals.totalMinor).toBe(360000 - 10000 + 400000 + 50000);
  });
});

describe("solo play around a timetable that already exists", () => {
  it("builds windows from opening hours and a break", () => {
    expect(playWindows("08:00:00", "18:00:00")).toEqual([{ start: "08:00", end: "18:00" }]);
    expect(playWindows("07:00", "19:00", "11:00", "16:00")).toEqual([
      { start: "07:00", end: "11:00" },
      { start: "16:00", end: "19:00" },
    ]);
  });

  it("keeps existing sessions, counts them, and never plans on top of them", () => {
    const existing = [
      { dogId: "a", yardId: "y1", start: "08:00", end: "08:20" },
      { dogId: "b", yardId: "y1", start: "08:20", end: "08:40" },
    ];
    const plan = planPlaySessions({
      dogs: [{ id: "a" }, { id: "b" }, { id: "c" }],
      yards: [{ id: "y1" }],
      windows: [{ start: "08:00", end: "10:00" }],
      sessionMinutes: 20,
      sessionsPerDog: 2,
      existing,
    });
    // a and b need one more each, c needs two.
    expect(plan.slotsNeeded).toBe(4);
    expect(plan.shortfall).toEqual([]);
    expect(plan.sessions.filter((s) => s.dogId === "c")).toHaveLength(2);
    expect(plan.sessions.filter((s) => s.dogId === "a")).toHaveLength(1);
    // Nothing new in the slots already taken.
    expect(plan.sessions.some((s) => s.start === "08:00" || s.start === "08:20")).toBe(false);
    // Fair before full: c gets its first session before a or b get their second.
    expect(plan.sessions[0].dogId).toBe("c");
  });

  it("keeps the changeover after an existing session and the gap for its dog", () => {
    const plan = planPlaySessions({
      dogs: [{ id: "a" }],
      yards: [{ id: "y1" }],
      windows: [{ start: "08:00", end: "12:00" }],
      sessionMinutes: 20,
      sessionsPerDog: 2,
      changeoverMinutes: 10,
      minGapMinutes: 60,
      existing: [{ dogId: "a", yardId: "y1", start: "08:00", end: "08:20" }],
    });
    expect(plan.sessions).toEqual([{ dogId: "a", yardId: "y1", start: "09:30", end: "09:50" }]);
  });
});
