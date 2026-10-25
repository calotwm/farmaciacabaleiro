import { afterEach, describe, expect, it } from "vitest";
import type { DeliveryStatus } from "./delivery-status";
import { DEFAULT_REMINDER_OFFSETS, deliveryReminderDue } from "./reminders";

const originalTz = process.env.TZ;

afterEach(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

const delivery = (iso: string, status: DeliveryStatus = "SCHEDULED") => ({ scheduledAt: new Date(iso), status });

describe.each(["UTC", "Asia/Tokyo", "America/Los_Angeles"])("deliveryReminderDue with server TZ=%s", (serverTz) => {
  it("reminds the day before and the same day by default", () => {
    process.env.TZ = serverTz;
    expect(DEFAULT_REMINDER_OFFSETS).toEqual([1, 0]);
    // Delivery on 2026-11-10 at 10:00 AR (13:00Z).
    const target = delivery("2026-11-10T13:00:00Z");
    expect(deliveryReminderDue(target, new Date("2026-11-09T11:00:00Z"))).toEqual([
      { daysBefore: 1, reminderDate: "2026-11-09", thresholdKey: "days-before-1" },
    ]);
    expect(deliveryReminderDue(target, new Date("2026-11-10T11:00:00Z"))).toEqual([
      { daysBefore: 0, reminderDate: "2026-11-10", thresholdKey: "days-before-0" },
    ]);
    expect(deliveryReminderDue(target, new Date("2026-11-08T11:00:00Z"))).toEqual([]);
  });

  it("uses the AR calendar day at the midnight edge, not the UTC day", () => {
    process.env.TZ = serverTz;
    // Delivery at 00:30 AR on 2026-11-10 = 03:30Z on the 10th. 23:59 AR on the 9th is 02:59Z on the 10th.
    const target = delivery("2026-11-10T03:30:00Z");
    // 02:59Z on the 10th is still 23:59 AR on the 9th: the day-before reminder is due although the UTC date is the 10th.
    expect(deliveryReminderDue(target, new Date("2026-11-10T02:59:00Z")).map((r) => r.daysBefore)).toEqual([1]);
    // 03:00Z is AR midnight: it is now the 10th, the same-day reminder is due (the delivery is 30 minutes away).
    expect(deliveryReminderDue(target, new Date("2026-11-10T03:00:00Z")).map((r) => r.daysBefore)).toEqual([0]);
    // At 03:30Z the delivery time has come: nothing is "due", it is late from here on.
    expect(deliveryReminderDue(target, new Date("2026-11-10T03:30:01Z"))).toEqual([]);
  });

  it("a delivery late in the AR evening is reminded on its own AR day, not the next UTC day", () => {
    process.env.TZ = serverTz;
    // 23:00 AR on the 9th = 02:00Z on the 10th.
    const target = delivery("2026-11-10T02:00:00Z");
    expect(deliveryReminderDue(target, new Date("2026-11-09T12:00:00Z")).map((r) => r.reminderDate)).toEqual(["2026-11-09"]);
    expect(deliveryReminderDue(target, new Date("2026-11-09T12:00:00Z")).map((r) => r.daysBefore)).toEqual([0]);
    expect(deliveryReminderDue(target, new Date("2026-11-08T12:00:00Z")).map((r) => r.daysBefore)).toEqual([1]);
  });
});

describe("deliveryReminderDue rules", () => {
  const now = new Date("2026-11-09T11:00:00Z");

  it("only reminds open deliveries whose time has not passed", () => {
    for (const status of ["RECEIVED", "CANCELLED", "RESCHEDULED", "COMPLETED"] as const) {
      expect(deliveryReminderDue(delivery("2026-11-10T13:00:00Z", status), now)).toEqual([]);
    }
    expect(deliveryReminderDue(delivery("2026-11-10T13:00:00Z", "CONFIRMED"), now)).toHaveLength(1);
    expect(deliveryReminderDue(delivery("2026-11-09T10:00:00Z"), now)).toEqual([]);
  });

  it("supports custom offsets (de-duplicated, invalid ones ignored)", () => {
    const target = delivery("2026-11-12T13:00:00Z");
    expect(deliveryReminderDue(target, now, [3, 1, 3, -1, 1.5])).toEqual([{ daysBefore: 3, reminderDate: "2026-11-09", thresholdKey: "days-before-3" }]);
    expect(deliveryReminderDue(target, now, [])).toEqual([]);
  });
});
