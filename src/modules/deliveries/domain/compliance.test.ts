import { describe, expect, it } from "vitest";
import { type ComplianceRow, computeCompliance, computeComplianceBySupplier } from "./compliance";
import type { DeliveryStatus, DeliveryType } from "./delivery-status";

const NOW = new Date("2026-11-10T15:00:00Z");

function row(status: DeliveryStatus, scheduledAt: string, receivedAt: string | null = null, type: DeliveryType = "DELIVERY", supplierId = "s1"): ComplianceRow {
  return { supplierId, type, status, scheduledAt: new Date(scheduledAt), receivedAt: receivedAt ? new Date(receivedAt) : null };
}

describe("supplier compliance", () => {
  it("counts on time, late, rescheduled, cancelled, overdue and pending, with the percentage", () => {
    const summary = computeCompliance(
      [
        row("RECEIVED", "2026-11-03T13:00:00Z", "2026-11-03T14:00:00Z"), // same day -> on time
        row("RECEIVED", "2026-11-04T13:00:00Z", "2026-11-02T12:00:00Z"), // before -> on time
        row("RECEIVED", "2026-11-05T13:00:00Z", "2026-11-07T12:00:00Z"), // after -> late
        row("RESCHEDULED", "2026-11-06T13:00:00Z"),
        row("CANCELLED", "2026-11-07T13:00:00Z"),
        row("CONFIRMED", "2026-11-08T13:00:00Z"), // open and past -> overdue
        row("SCHEDULED", "2026-11-20T13:00:00Z"), // open, future -> pending (not judged)
      ],
      NOW,
    );
    expect(summary).toEqual({
      scheduled: 7,
      onTime: 2,
      receivedLate: 1,
      rescheduled: 1,
      cancelled: 1,
      overdue: 1,
      pending: 1,
      onTimePercentage: 33, // 2 of the 6 judged
    });
  });

  it("compares calendar days in AR time, not UTC days (AR midnight edge)", () => {
    // Scheduled 22:00 AR on the 5th (01:00Z on the 6th); received 23:30 AR the same AR day (02:30Z on the 6th).
    const sameArDay = computeCompliance([row("RECEIVED", "2026-11-06T01:00:00Z", "2026-11-06T02:30:00Z")], NOW);
    expect(sameArDay.onTime).toBe(1);
    // Received at 00:30 AR on the 6th (03:30Z): the next AR day -> late.
    const nextArDay = computeCompliance([row("RECEIVED", "2026-11-06T01:00:00Z", "2026-11-06T03:30:00Z")], NOW);
    expect(nextArDay.receivedLate).toBe(1);
  });

  it("ignores visits and has no percentage until something concluded", () => {
    const onlyVisits = computeCompliance([row("COMPLETED", "2026-11-03T13:00:00Z", null, "SALES_VISIT"), row("CANCELLED", "2026-11-03T13:00:00Z", null, "ORDER_TAKING")], NOW);
    expect(onlyVisits).toMatchObject({ scheduled: 0, onTimePercentage: null });
    const onlyPending = computeCompliance([row("SCHEDULED", "2026-12-03T13:00:00Z")], NOW);
    expect(onlyPending).toMatchObject({ scheduled: 1, pending: 1, onTimePercentage: null });
    expect(computeCompliance([], NOW).onTimePercentage).toBeNull();
  });

  it("does not hold a received delivery without a receipt date against the supplier", () => {
    expect(computeCompliance([row("RECEIVED", "2026-11-03T13:00:00Z")], NOW)).toMatchObject({ onTime: 1, receivedLate: 0, onTimePercentage: 100 });
  });

  it("groups by supplier", () => {
    const grouped = computeComplianceBySupplier(
      [row("RECEIVED", "2026-11-03T13:00:00Z", "2026-11-03T14:00:00Z", "DELIVERY", "a"), row("CANCELLED", "2026-11-03T13:00:00Z", null, "DELIVERY", "b")],
      NOW,
    );
    expect(grouped.get("a")).toMatchObject({ onTime: 1, onTimePercentage: 100 });
    expect(grouped.get("b")).toMatchObject({ cancelled: 1, onTimePercentage: 0 });
    expect(grouped.size).toBe(2);
  });
});
