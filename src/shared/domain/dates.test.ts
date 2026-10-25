import { afterEach, describe, expect, it } from "vitest";
import {
  addDays,
  daysUntil,
  expiryFromMonthYear,
  formatDate,
  formatDateTime,
  fromDbDate,
  isValidCalendarDate,
  parseDisplayDate,
  todayInTz,
  toDbDate,
} from "./dates";

const originalTz = process.env.TZ;

afterEach(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

describe.each(["UTC", "Asia/Tokyo", "America/Los_Angeles"])("with server TZ=%s", (serverTz) => {
  it("todayInTz respects the Buenos Aires midnight boundary (UTC-3)", () => {
    process.env.TZ = serverTz;
    expect(todayInTz(new Date("2026-03-10T02:59:59.999Z"))).toBe("2026-03-09");
    expect(todayInTz(new Date("2026-03-10T03:00:00.000Z"))).toBe("2026-03-10");
    expect(todayInTz(new Date("2026-12-31T23:30:00.000Z"))).toBe("2026-12-31");
    expect(todayInTz(new Date("2027-01-01T03:00:00.000Z"))).toBe("2027-01-01");
  });

  it("formatDateTime renders in AR time", () => {
    process.env.TZ = serverTz;
    expect(formatDateTime(new Date("2026-03-10T02:59:00Z"))).toBe("09/03/2026 23:59");
    expect(formatDateTime(new Date("2026-03-10T03:00:00Z"))).toBe("10/03/2026 00:00");
    expect(formatDateTime(new Date("2026-07-01T15:05:00Z"))).toBe("01/07/2026 12:05");
  });

  it("formatDate and DB date round trips are timezone independent", () => {
    process.env.TZ = serverTz;
    expect(formatDate("2026-01-05")).toBe("05/01/2026");
    expect(fromDbDate(toDbDate("2026-02-28"))).toBe("2026-02-28");
    expect(fromDbDate(new Date("2030-01-31T00:00:00Z"))).toBe("2030-01-31");
  });
});

describe("todayInTz", () => {
  it("supports other timezones", () => {
    expect(todayInTz(new Date("2026-03-10T02:00:00Z"), "Asia/Tokyo")).toBe("2026-03-10");
    expect(todayInTz(new Date("2026-03-10T02:00:00Z"), "America/Argentina/Buenos_Aires")).toBe("2026-03-09");
  });
});

describe("daysUntil", () => {
  it("is 0 on the expiry day, positive before and negative after", () => {
    expect(daysUntil("2026-03-10", "2026-03-10")).toBe(0);
    expect(daysUntil("2026-03-10", "2026-03-09")).toBe(1);
    expect(daysUntil("2026-03-10", "2026-03-11")).toBe(-1);
  });

  it("handles month, leap-year and year boundaries", () => {
    expect(daysUntil("2024-03-01", "2024-02-28")).toBe(2);
    expect(daysUntil("2026-03-01", "2026-02-28")).toBe(1);
    expect(daysUntil("2027-01-01", "2026-12-31")).toBe(1);
    expect(daysUntil("2026-12-31", "2026-01-01")).toBe(364);
  });

  it("is not affected by the server timezone or DST changes elsewhere", () => {
    process.env.TZ = "America/New_York";
    expect(daysUntil("2026-03-09", "2026-03-07")).toBe(2);
    expect(daysUntil("2026-11-02", "2026-10-31")).toBe(2);
  });

  it("rejects invalid dates", () => {
    expect(() => daysUntil("2026-02-30", "2026-01-01")).toThrow(RangeError);
    expect(() => daysUntil("nope", "2026-01-01")).toThrow(RangeError);
  });
});

describe("addDays / isValidCalendarDate", () => {
  it("adds across boundaries", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
  });

  it("validates real calendar dates only", () => {
    expect(isValidCalendarDate("2024-02-29")).toBe(true);
    expect(isValidCalendarDate("2026-02-29")).toBe(false);
    expect(isValidCalendarDate("2026-13-01")).toBe(false);
    expect(isValidCalendarDate("26-01-01")).toBe(false);
  });
});

describe("parseDisplayDate", () => {
  it("parses DD/MM/AAAA", () => {
    expect(parseDisplayDate("05/01/2026")).toBe("2026-01-05");
    expect(parseDisplayDate("5/1/2026")).toBe("2026-01-05");
    expect(parseDisplayDate(" 29/02/2024 ")).toBe("2024-02-29");
  });

  it("returns null for malformed or impossible dates", () => {
    expect(parseDisplayDate("31/02/2026")).toBeNull();
    expect(parseDisplayDate("29/02/2026")).toBeNull();
    expect(parseDisplayDate("2026-01-05")).toBeNull();
    expect(parseDisplayDate("01/13/2026")).toBeNull();
    expect(parseDisplayDate("")).toBeNull();
  });
});

describe("expiryFromMonthYear", () => {
  it("returns the last day of the month", () => {
    expect(expiryFromMonthYear("01/2026")).toBe("2026-01-31");
    expect(expiryFromMonthYear("04/2026")).toBe("2026-04-30");
    expect(expiryFromMonthYear("02/2026")).toBe("2026-02-28");
    expect(expiryFromMonthYear("02/2028")).toBe("2028-02-29");
    expect(expiryFromMonthYear("12/2026")).toBe("2026-12-31");
    expect(expiryFromMonthYear("3/2027")).toBe("2027-03-31");
  });

  it("returns null for invalid input", () => {
    expect(expiryFromMonthYear("13/2026")).toBeNull();
    expect(expiryFromMonthYear("00/2026")).toBeNull();
    expect(expiryFromMonthYear("2026-01")).toBeNull();
    expect(expiryFromMonthYear("")).toBeNull();
  });
});
