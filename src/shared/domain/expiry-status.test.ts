import { describe, expect, it } from "vitest";
import { assessExpiry } from "./expiry-status";

const TODAY = "2026-06-15";

describe("assessExpiry", () => {
  it("is EXPIRED only after the expiry day (valid through the whole day)", () => {
    expect(assessExpiry("2026-06-15", TODAY)).toMatchObject({ status: "CRITICAL", daysLeft: 0 });
    expect(assessExpiry("2026-06-14", TODAY)).toEqual({ status: "EXPIRED", daysLeft: -1, crossedThreshold: null });
  });

  it("is CRITICAL at 30 days or fewer, with the threshold bucket", () => {
    expect(assessExpiry("2026-07-15", TODAY)).toEqual({ status: "CRITICAL", daysLeft: 30, crossedThreshold: 30 });
    expect(assessExpiry("2026-06-22", TODAY)).toEqual({ status: "CRITICAL", daysLeft: 7, crossedThreshold: 7 });
    expect(assessExpiry("2026-06-23", TODAY)).toMatchObject({ daysLeft: 8, crossedThreshold: 30 });
  });

  it("is WARNING between 31 and 180 days", () => {
    expect(assessExpiry("2026-07-16", TODAY)).toEqual({ status: "WARNING", daysLeft: 31, crossedThreshold: 60 });
    expect(assessExpiry("2026-12-12", TODAY)).toEqual({ status: "WARNING", daysLeft: 180, crossedThreshold: 180 });
    expect(assessExpiry("2026-09-13", TODAY)).toMatchObject({ status: "WARNING", daysLeft: 90, crossedThreshold: 90 });
  });

  it("is NORMAL beyond the widest threshold", () => {
    expect(assessExpiry("2026-12-13", TODAY)).toEqual({ status: "NORMAL", daysLeft: 181, crossedThreshold: null });
  });

  it("honours custom thresholds and critical days, in any order", () => {
    const options = { thresholds: [10, 100, 50], criticalDays: 10 };
    expect(assessExpiry("2026-06-20", TODAY, options)).toMatchObject({ status: "CRITICAL", crossedThreshold: 10 });
    expect(assessExpiry("2026-07-15", TODAY, options)).toMatchObject({ status: "WARNING", crossedThreshold: 50 });
    expect(assessExpiry("2026-10-24", TODAY, options)).toMatchObject({ status: "NORMAL", crossedThreshold: null });
  });

  it("works across year boundaries", () => {
    expect(assessExpiry("2027-01-01", "2026-12-31")).toMatchObject({ status: "CRITICAL", daysLeft: 1 });
  });
});
