import { describe, expect, it } from "vitest";
import { deliveryAlertState, isLate, needsConfirmation } from "./delivery-schedule";
import type { DeliveryStatus } from "./delivery-status";

const NOW = new Date("2026-11-10T15:00:00Z");
const at = (iso: string, status: DeliveryStatus = "SCHEDULED") => ({ scheduledAt: new Date(iso), status });

describe("late deliveries", () => {
  it("is late when the scheduled instant passed and it is still open", () => {
    expect(isLate(at("2026-11-10T14:59:59Z"), NOW)).toBe(true);
    expect(isLate(at("2026-11-10T14:59:59Z", "CONFIRMED"), NOW)).toBe(true);
  });

  it("is not late at the exact scheduled instant or in the future", () => {
    expect(isLate(at("2026-11-10T15:00:00Z"), NOW)).toBe(false);
    expect(isLate(at("2026-11-11T15:00:00Z"), NOW)).toBe(false);
  });

  it("closed deliveries are never late", () => {
    for (const status of ["RECEIVED", "CANCELLED", "RESCHEDULED", "COMPLETED"] as const) {
      expect(isLate(at("2026-01-01T00:00:00Z", status), NOW)).toBe(false);
    }
  });

  it("uses the instant, so a delivery of 'today' becomes late once its hour passes (AR time)", () => {
    // 11:00 AR = 14:00Z; now is 12:00 AR.
    expect(isLate(at("2026-11-10T14:00:00Z"), NOW)).toBe(true);
    // 13:00 AR = 16:00Z is still ahead.
    expect(isLate(at("2026-11-10T16:00:00Z"), NOW)).toBe(false);
  });
});

describe("pending confirmation", () => {
  it("applies to SCHEDULED deliveries due within 48 hours", () => {
    expect(needsConfirmation(at("2026-11-10T15:00:00Z"), NOW)).toBe(true);
    expect(needsConfirmation(at("2026-11-12T15:00:00Z"), NOW)).toBe(true);
    expect(needsConfirmation(at("2026-11-12T15:00:01Z"), NOW)).toBe(false);
  });

  it("does not apply to confirmed, closed or already late deliveries", () => {
    expect(needsConfirmation(at("2026-11-11T10:00:00Z", "CONFIRMED"), NOW)).toBe(false);
    expect(needsConfirmation(at("2026-11-11T10:00:00Z", "CANCELLED"), NOW)).toBe(false);
    expect(needsConfirmation(at("2026-11-10T14:00:00Z"), NOW)).toBe(false);
  });

  it("alert state: late wins, then pending, otherwise none", () => {
    expect(deliveryAlertState(at("2026-11-09T10:00:00Z"), NOW)).toBe("LATE");
    expect(deliveryAlertState(at("2026-11-11T10:00:00Z"), NOW)).toBe("PENDING_CONFIRMATION");
    expect(deliveryAlertState(at("2026-11-11T10:00:00Z", "CONFIRMED"), NOW)).toBeNull();
    expect(deliveryAlertState(at("2026-12-01T10:00:00Z"), NOW)).toBeNull();
  });
});
