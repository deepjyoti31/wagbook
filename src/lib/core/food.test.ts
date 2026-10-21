import { describe, expect, it } from "vitest";
import {
  billPeriod,
  boarderRecipeIndex,
  cookPlan,
  coversDays,
  DEFAULT_PORTIONS,
  dailyGrams,
  deliveryCutoff,
  deliveryDays,
  formatQuantity,
  isLow,
  isoWeekday,
  lotsLeft,
  packedGrams,
  parseQuantity,
  portionGrams,
  portionReviewDue,
  priceForGrams,
  shoppingList,
  sizeBand,
  trialsToFollowUp,
  usingSoon,
  weekStart,
  zonedInstant,
} from "./food";

describe("stock", () => {
  it("uses up the soonest to go off first", () => {
    const lots = lotsLeft([
      { kind: "purchase", quantity: 5000, happened_on: "2027-03-01", use_by: "2027-03-05" },
      { kind: "purchase", quantity: 3000, happened_on: "2027-03-02", use_by: "2027-03-04" },
      { kind: "used", quantity: -4000, happened_on: "2027-03-03", use_by: null },
      { kind: "count", quantity: 200, happened_on: "2027-03-03", use_by: null },
    ]);
    expect(lots).toEqual([
      { in_on: "2027-03-01", use_by: "2027-03-05", left: 4000 },
      { in_on: "2027-03-03", use_by: null, left: 200 },
    ]);
    expect(usingSoon(lots, "2027-03-03")).toEqual([lots[0]]);
    expect(usingSoon(lots, "2027-03-01")).toEqual([]);
  });

  it("is low at or below its level, never without one", () => {
    expect(isLow(500, 500)).toBe(true);
    expect(isLow(501, 500)).toBe(false);
    expect(isLow(0, null)).toBe(false);
  });

  it("reads quantities in kilos, litres or the unit itself", () => {
    expect(parseQuantity("2.5 kg", "g")).toBe(2500);
    expect(parseQuantity("750", "g")).toBe(750);
    expect(parseQuantity("1,5 l", "ml")).toBe(1500);
    expect(parseQuantity("12", "piece")).toBe(12);
    expect(parseQuantity("1.5", "piece")).toBeNull();
    expect(parseQuantity("2 kg", "piece")).toBeNull();
    expect(parseQuantity("0", "g")).toBeNull();
    expect(parseQuantity("lots", "g")).toBeNull();
    expect(formatQuantity(2500, "g")).toBe("2.5 kg");
    expect(formatQuantity(750, "ml")).toBe("750 ml");
    expect(formatQuantity(12, "piece")).toBe("12");
  });
});

describe("portions", () => {
  it("match the worked example: a 20 kg dog eats 500 g a day, 167 g as a topper", () => {
    expect(sizeBand(20_000, DEFAULT_PORTIONS)).toBe("medium");
    expect(portionGrams({ weightG: 20_000, plan: "full", goal: "keep" }, DEFAULT_PORTIONS)).toBe(500);
    expect(portionGrams({ weightG: 20_000, plan: "topper", goal: "keep" }, DEFAULT_PORTIONS)).toBe(167);
    expect(portionGrams({ weightG: 20_000, plan: "full", goal: "lose" }, DEFAULT_PORTIONS)).toBe(450);
    expect(portionGrams({ weightG: 20_000, plan: "full", goal: "gain" }, DEFAULT_PORTIONS)).toBe(550);
  });

  it("use each size band's share", () => {
    expect(portionGrams({ weightG: 8_000, plan: "full", goal: "keep" }, DEFAULT_PORTIONS)).toBe(240);
    expect(portionGrams({ weightG: 10_000, plan: "full", goal: "keep" }, DEFAULT_PORTIONS)).toBe(300);
    expect(portionGrams({ weightG: 32_000, plan: "full", goal: "keep" }, DEFAULT_PORTIONS)).toBe(640);
    expect(portionGrams({ weightG: 32_000, plan: "full", goal: "keep" }, { ...DEFAULT_PORTIONS, portion_large_bp: 180 })).toBe(576);
  });

  it("are the grams set by hand when a manager set them, and nothing without a weight", () => {
    expect(dailyGrams({ weight_g: 20_000 }, { plan: "full", goal: "keep", grams_by_hand: 420 }, DEFAULT_PORTIONS)).toBe(420);
    expect(dailyGrams({ weight_g: 20_000 }, null, DEFAULT_PORTIONS)).toBe(500);
    expect(dailyGrams({ weight_g: null }, null, DEFAULT_PORTIONS)).toBeNull();
  });

  it("are due a look a week after a pet starts", () => {
    expect(portionReviewDue({ started_on: "2027-03-01", reviewed_on: null }, "2027-03-07")).toBe(false);
    expect(portionReviewDue({ started_on: "2027-03-01", reviewed_on: null }, "2027-03-08")).toBe(true);
    expect(portionReviewDue({ started_on: "2027-03-01", reviewed_on: "2027-03-09" }, "2027-03-10")).toBe(false);
    expect(portionReviewDue({ started_on: null, reviewed_on: null }, "2027-03-10")).toBe(false);
  });
});

describe("deliveries", () => {
  it("cover the days until the next, in whole packs", () => {
    // Tuesday and Friday: Tuesday covers 3 days, Friday 4.
    expect(coversDays([2, 5], 2)).toBe(3);
    expect(coversDays([2, 5], 5)).toBe(4);
    expect(coversDays([3], 3)).toBe(7);
    expect(packedGrams(500, 3, 250)).toBe(1500);
    expect(packedGrams(167, 4, 250)).toBe(750);
    expect(isoWeekday("2027-03-02")).toBe(2);
    expect(isoWeekday("2027-03-07")).toBe(7);
    expect(deliveryDays({ weekdays: [2, 5], grams_per_day: 500 }, "2027-03-01", "2027-03-07", 250)).toEqual([
      { date: "2027-03-02", covers: 3, grams: 1500 },
      { date: "2027-03-05", covers: 4, grams: 2000 },
    ]);
    expect(priceForGrams(1500, 40_000)).toBe(60_000);
    expect(priceForGrams(250, 33_333)).toBe(8_333);
  });

  it("close for changes a day before the slot, in the kennel's time zone", () => {
    expect(zonedInstant("2027-03-02", "08:00", "Asia/Kolkata").toISOString()).toBe("2027-03-02T02:30:00.000Z");
    expect(deliveryCutoff("2027-03-02", "morning", "Asia/Kolkata", 24).toISOString()).toBe("2027-03-01T02:30:00.000Z");
    expect(deliveryCutoff("2027-03-02", "evening", "Asia/Kolkata", 0).toISOString()).toBe("2027-03-02T12:30:00.000Z");
    // Across a change of the clocks.
    expect(zonedInstant("2027-03-14", "08:00", "America/New_York").toISOString()).toBe("2027-03-14T12:00:00.000Z");
  });

  it("are billed a week from Monday, or a calendar month", () => {
    expect(weekStart("2027-03-05")).toBe("2027-03-01");
    expect(billPeriod("2027-03-05", "week")).toEqual({ from: "2027-03-01", to: "2027-03-07" });
    expect(billPeriod("2027-02-10", "month")).toEqual({ from: "2027-02-01", to: "2027-02-28" });
    expect(billPeriod("2027-12-10", "month")).toEqual({ from: "2027-12-01", to: "2027-12-31" });
  });

  it("follow up trials a few days after, once, for parents with no subscription", () => {
    const trials = [
      { delivery_date: "2027-03-01", status: "delivered", client_id: "a" },
      { delivery_date: "2027-03-01", status: "delivered", client_id: "b" },
      { delivery_date: "2027-03-03", status: "delivered", client_id: "c" },
      { delivery_date: "2027-03-01", status: "cancelled", client_id: "d" },
      { delivery_date: "2027-03-01", status: "delivered", client_id: "e" },
    ];
    expect(trialsToFollowUp(trials, new Set(["b"]), new Set(["e"]), "2027-03-04").map((t) => t.client_id)).toEqual(["a"]);
  });
});

describe("the rotation and the cook plan", () => {
  it("gives boarders each recipe for three or four days, repeating every two weeks", () => {
    const days = Array.from({ length: 15 }, (_, i) => boarderRecipeIndex(`2026-01-${String(5 + i).padStart(2, "0")}`, 4));
    expect(days).toEqual([0, 0, 0, 0, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 0]);
    expect(boarderRecipeIndex("2025-12-31", 4)).toBe(2);
    expect(boarderRecipeIndex("2026-01-05", 0)).toBe(-1);
  });

  it("for ten deliveries and six boarders equals a count by hand", () => {
    const deliveries = [
      ...Array.from({ length: 6 }, () => ({ recipe_id: "chicken", grams: 1500 })),
      ...Array.from({ length: 4 }, () => ({ recipe_id: "fish", grams: 2000 })),
    ];
    const boarders = [
      ...Array.from({ length: 5 }, () => ({ recipe_id: "chicken", grams: 400 })),
      { recipe_id: "chicken", grams: 250 },
    ];
    // By hand: chicken 9 kg for deliveries and 2.25 kg for boarders, 11.25 kg, plus 10% is 12.375 kg, so 12.4 kg; fish 8 kg plus 10% is 8.8 kg.
    expect(cookPlan(deliveries, boarders, 1000)).toEqual([
      { recipe_id: "chicken", deliveries: 9000, boarders: 2250, cook: 12_400 },
      { recipe_id: "fish", deliveries: 8000, boarders: 0, cook: 8800 },
    ]);
  });

  it("buys what the plan needs less what is in stock, by supplier", () => {
    const list = shoppingList(
      [{ version_id: "v1", grams: 12_400 }, { version_id: "v2", grams: 8800 }],
      [
        { version_id: "v1", item_id: "chicken", quantity_per_kg: 600 },
        { version_id: "v1", item_id: "rice", quantity_per_kg: 300 },
        { version_id: "v2", item_id: "fish", quantity_per_kg: 650 },
        { version_id: "v2", item_id: "rice", quantity_per_kg: 250 },
      ],
      [
        { item_id: "chicken", name: "Chicken", unit: "g", supplier_id: "butcher", on_hand: 2000 },
        { item_id: "fish", name: "Fish", unit: "g", supplier_id: "butcher", on_hand: 10_000 },
        { item_id: "rice", name: "Rice", unit: "g", supplier_id: null, on_hand: -5 },
      ],
    );
    expect(list).toEqual([
      { item_id: "chicken", name: "Chicken", unit: "g", supplier_id: "butcher", need: 7440, have: 2000, buy: 5440 },
      { item_id: "rice", name: "Rice", unit: "g", supplier_id: null, need: 5920, have: 0, buy: 5920 },
    ]);
  });
});
