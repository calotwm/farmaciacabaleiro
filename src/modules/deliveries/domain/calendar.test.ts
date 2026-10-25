import { describe, expect, it } from "vitest";
import { buildMonthGrid, formatLongDay, gridRange, groupByDay, monthKey, monthLabel, monthOf, parseMonth, shiftMonth } from "./calendar";

describe("month grid", () => {
  it("starts on Monday and pads with neighbouring days (November 2026 starts on a Sunday)", () => {
    const weeks = buildMonthGrid({ year: 2026, month: 11 });
    expect(weeks).toHaveLength(6);
    expect(weeks[0][0]).toBe("2026-10-26"); // Monday
    expect(weeks[0][6]).toBe("2026-11-01"); // Sunday: the 1st
    expect(weeks[5][6]).toBe("2026-12-06");
    expect(weeks.every((week) => week.length === 7)).toBe(true);
  });

  it("uses exactly four weeks when February starts on a Monday (2027)", () => {
    const weeks = buildMonthGrid({ year: 2027, month: 2 });
    expect(weeks).toHaveLength(4);
    expect(weeks[0][0]).toBe("2027-02-01");
    expect(weeks[3][6]).toBe("2027-02-28");
  });

  it("handles leap years and a month ending on a Sunday", () => {
    expect(buildMonthGrid({ year: 2028, month: 2 }).flat()).toContain("2028-02-29");
    const weeks = buildMonthGrid({ year: 2026, month: 5 }); // May 2026 ends on a Sunday (31st)
    expect(weeks[weeks.length - 1][6]).toBe("2026-05-31");
  });

  it("reports the visible range with an exclusive end", () => {
    expect(gridRange({ year: 2026, month: 11 })).toEqual({ from: "2026-10-26", toExclusive: "2026-12-07" });
  });
});

describe("month helpers", () => {
  it("parses, formats and shifts months across year boundaries", () => {
    expect(parseMonth("2026-11")).toEqual({ year: 2026, month: 11 });
    expect(parseMonth("2026-13")).toBeNull();
    expect(parseMonth("2026-1")).toBeNull();
    expect(parseMonth(undefined)).toBeNull();
    expect(monthKey({ year: 2026, month: 3 })).toBe("2026-03");
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth({ year: 2026, month: 5 }, -17)).toEqual({ year: 2024, month: 12 });
    expect(monthOf("2026-11-05")).toEqual({ year: 2026, month: 11 });
    expect(monthLabel({ year: 2026, month: 11 })).toBe("Noviembre 2026");
    expect(formatLongDay("2026-10-26")).toBe("Lunes 26 de octubre");
  });
});

describe("groupByDay", () => {
  it("groups by AR day, so 23:30 AR and 00:30 AR fall on different days", () => {
    const items = [
      { id: "a", scheduledAt: new Date("2026-11-10T02:30:00Z") }, // 23:30 AR on the 9th
      { id: "b", scheduledAt: new Date("2026-11-10T03:30:00Z") }, // 00:30 AR on the 10th
      { id: "c", scheduledAt: new Date("2026-11-10T20:00:00Z") }, // 17:00 AR on the 10th
    ];
    const groups = groupByDay(items);
    expect(groups.get("2026-11-09")?.map((item) => item.id)).toEqual(["a"]);
    expect(groups.get("2026-11-10")?.map((item) => item.id)).toEqual(["b", "c"]);
  });
});
