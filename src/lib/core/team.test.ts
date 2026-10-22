import { describe, expect, it } from "vitest";
import { attendanceSheet, clockTime, decimalHours, endsNextDay, formatHours, leaveDaysIn, minutesBetween, onRotaNow, shiftSpan, stretchFrom, weekDays } from "./team";
import { weekStart } from "./food";

describe("shifts", () => {
  it("end the next day when they end at or before their start", () => {
    expect(shiftSpan("2026-11-03", "07:00:00", "15:00:00")).toEqual({ start: "2026-11-03T07:00", end: "2026-11-03T15:00" });
    expect(shiftSpan("2026-11-30", "23:00", "07:00")).toEqual({ start: "2026-11-30T23:00", end: "2026-12-01T07:00" });
    expect(endsNextDay("23:00", "07:00")).toBe(true);
    expect(endsNextDay("07:00", "15:00")).toBe(false);
  });

  it("are on now from their start until just before their end", () => {
    const rows = [
      { user_id: "a", starts_at: "2026-11-03 07:00:00", ends_at: "2026-11-03 15:00:00" },
      { user_id: "b", starts_at: "2026-11-02T23:00:00", ends_at: "2026-11-03T07:00:00" },
      { user_id: "c", starts_at: "2026-11-03T15:00:00", ends_at: "2026-11-03T23:00:00" },
    ];
    expect(onRotaNow(rows, "2026-11-03T06:59").map((r) => r.user_id)).toEqual(["b"]);
    expect(onRotaNow(rows, "2026-11-03T07:00").map((r) => r.user_id)).toEqual(["a"]);
    expect(onRotaNow(rows, "2026-11-03T15:00").map((r) => r.user_id)).toEqual(["c"]);
  });
});

describe("weeks", () => {
  it("start on a Monday", () => {
    expect(weekStart("2026-11-05")).toBe("2026-11-02");
    expect(weekStart("2026-11-02")).toBe("2026-11-02");
    expect(weekStart("2026-11-08")).toBe("2026-11-02");
    expect(weekDays("2026-11-30")).toEqual(["2026-11-30", "2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04", "2026-12-05", "2026-12-06"]);
  });
});

describe("hours", () => {
  it("are whole minutes, read as h:mm and as decimal hours", () => {
    expect(minutesBetween("2026-11-03T01:30:00Z", "2026-11-03T09:35:59Z")).toBe(485);
    expect(minutesBetween("2026-11-03T09:00:00Z", "2026-11-03T08:00:00Z")).toBe(0);
    expect(formatHours(485)).toBe("8:05");
    expect(decimalHours(485)).toBe("8.08");
    expect(formatHours(0)).toBe("0:00");
  });
});

describe("the month's attendance sheet", () => {
  const people = [
    { user_id: "meena", display_name: "Meena" },
    { user_id: "ravi", display_name: "Ravi" },
  ];

  it("counts leave only on the month's days", () => {
    expect(leaveDaysIn("2026-11", "2026-10-30", "2026-11-02")).toEqual(["2026-11-01", "2026-11-02"]);
    expect(leaveDaysIn("2026-11", "2026-12-01", "2026-12-02")).toEqual([]);
  });

  it("puts a night shift on the evening it began, and flags a stretch not clocked out", () => {
    const sheet = attendanceSheet(
      "2026-11",
      people,
      [
        // 07:00 to 15:00 in Bengaluru.
        { user_id: "meena", work_date: "2026-11-03", clocked_in_at: "2026-11-03T01:30:00Z", clocked_out_at: "2026-11-03T09:30:00Z" },
        // 23:00 on the 3rd to 07:00 on the 4th: the 3rd.
        { user_id: "meena", work_date: "2026-11-03", clocked_in_at: "2026-11-03T17:30:00Z", clocked_out_at: "2026-11-04T01:30:00Z" },
        { user_id: "meena", work_date: "2026-11-05", clocked_in_at: "2026-11-05T01:30:00Z", clocked_out_at: null },
        // Another month.
        { user_id: "meena", work_date: "2026-10-31", clocked_in_at: "2026-10-31T01:30:00Z", clocked_out_at: "2026-10-31T09:30:00Z" },
        { user_id: "ravi", work_date: "2026-11-30", clocked_in_at: "2026-11-30T17:30:00Z", clocked_out_at: "2026-12-01T01:00:00Z" },
      ],
      [{ user_id: "ravi", starts_on: "2026-11-10", ends_on: "2026-11-12" }],
      [
        { user_id: "meena", work_date: "2026-11-03" },
        { user_id: "meena", work_date: "2026-11-03" },
        { user_id: "ravi", work_date: "2026-11-30" },
      ],
    );
    const [meena, ravi] = sheet;
    expect(meena.days).toHaveLength(30);
    expect(meena.days[2]).toEqual({ date: "2026-11-03", minutes: 960, stretches: 2, open: false, onLeave: false, shifts: 2 });
    expect(meena.days[4]).toMatchObject({ date: "2026-11-05", minutes: 0, open: true });
    expect([meena.daysWorked, meena.minutes, meena.open, meena.rotaShifts, meena.leaveDays]).toEqual([2, 960, 1, 2, 0]);
    expect([ravi.daysWorked, ravi.minutes, ravi.open, ravi.leaveDays]).toEqual([1, 450, 0, 3]);
    expect(ravi.days.filter((d) => d.onLeave).map((d) => d.date)).toEqual(["2026-11-10", "2026-11-11", "2026-11-12"]);
  });
});

describe("times typed by hand", () => {
  it("are HH:MM on the kennel's clock", () => {
    expect(clockTime("07:30")).toBe("07:30");
    expect(clockTime("07:30:00")).toBe("07:30");
    expect(clockTime("24:00")).toBeNull();
    expect(clockTime("7:30")).toBeNull();
    expect(clockTime(null)).toBeNull();
  });

  it("make a stretch, out before in being the next morning", () => {
    expect(stretchFrom("2026-11-03", "07:00", "15:00", "Asia/Kolkata")).toEqual({ in: "2026-11-03T01:30:00.000Z", out: "2026-11-03T09:30:00.000Z" });
    expect(stretchFrom("2026-11-30", "23:00", "07:00", "Asia/Kolkata")).toEqual({ in: "2026-11-30T17:30:00.000Z", out: "2026-12-01T01:30:00.000Z" });
    expect(stretchFrom("2026-11-03", "07:00", null, "Asia/Kolkata")).toEqual({ in: "2026-11-03T01:30:00.000Z", out: null });
    expect(stretchFrom("2026-02-30", "07:00", null, "Asia/Kolkata")).toBeNull();
  });
});
