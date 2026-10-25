import { type CalendarDate, addDays, todayInTz } from "@/shared/domain/dates";
import { type DeliveryStatus, isOpenDelivery } from "./delivery-status";

/** Default reminders: the day before and the same day (days before the scheduled AR day). */
export const DEFAULT_REMINDER_OFFSETS: readonly number[] = [1, 0];

export interface ReminderDue {
  /** Whole AR calendar days between the reminder and the scheduled day. */
  daysBefore: number;
  /** The AR day the reminder belongs to (today, when due). */
  reminderDate: CalendarDate;
  /** Stable key for the alert event threshold (`AlertEvent.thresholdKey`) so a repeated run creates nothing new. */
  thresholdKey: string;
}

/**
 * The reminders of a delivery that are due `now`. Pure and idempotent: the worker (T4.4) calls it once a
 * day and maps each result to an AlertEvent keyed by (rule, delivery, thresholdKey, today).
 *
 * A reminder is due when today (AR calendar day) is `daysBefore` days before the scheduled AR day, the
 * delivery is still open and its time has not passed (a passed one is "late", a different rule). Because
 * both days are AR calendar days, a delivery at 00:30 AR is reminded the previous AR evening, whatever the
 * server timezone or the UTC date.
 */
export function deliveryReminderDue(
  delivery: { scheduledAt: Date; status: DeliveryStatus },
  now: Date,
  offsets: readonly number[] = DEFAULT_REMINDER_OFFSETS,
): ReminderDue[] {
  if (!isOpenDelivery(delivery.status) || delivery.scheduledAt.getTime() < now.getTime()) return [];
  const today = todayInTz(now);
  const scheduledDay = todayInTz(delivery.scheduledAt);
  return [...new Set(offsets)]
    .filter((daysBefore) => Number.isInteger(daysBefore) && daysBefore >= 0)
    .sort((a, b) => b - a)
    .map((daysBefore) => ({ daysBefore, reminderDate: addDays(scheduledDay, -daysBefore), thresholdKey: `days-before-${daysBefore}` }))
    .filter((reminder) => reminder.reminderDate === today);
}
