import { type CalendarDate, daysUntil } from "./dates";

export const DEFAULT_EXPIRY_THRESHOLDS_DAYS: readonly number[] = [180, 90, 60, 30, 7];
export const DEFAULT_CRITICAL_DAYS = 30;

export type ExpiryStatus = "NORMAL" | "WARNING" | "CRITICAL" | "EXPIRED";

export interface ExpiryAssessment {
  status: ExpiryStatus;
  /** Days left until the expiry date (0 on the expiry day, negative when expired). */
  daysLeft: number;
  /** Smallest configured threshold that daysLeft has already crossed, or null. */
  crossedThreshold: number | null;
}

export interface ExpiryOptions {
  thresholds?: readonly number[];
  /** At or below this many days the lot is CRITICAL. Defaults to 30. */
  criticalDays?: number;
}

/**
 * Rules:
 * - EXPIRED  : today is after the expiry date (the lot is valid through its whole expiry day).
 * - CRITICAL : daysLeft <= criticalDays (default 30).
 * - WARNING  : daysLeft <= the largest configured threshold (default 180).
 * - NORMAL   : otherwise.
 * `crossedThreshold` is the smallest threshold >= daysLeft (e.g. 25 days -> 30), which
 * is the alert bucket the lot currently sits in; null when none applies or expired.
 */
export function assessExpiry(
  expiryDate: CalendarDate,
  today: CalendarDate,
  options: ExpiryOptions = {},
): ExpiryAssessment {
  const thresholds = [...(options.thresholds ?? DEFAULT_EXPIRY_THRESHOLDS_DAYS)].sort((a, b) => a - b);
  const criticalDays = options.criticalDays ?? DEFAULT_CRITICAL_DAYS;
  const daysLeft = daysUntil(expiryDate, today);

  if (daysLeft < 0) return { status: "EXPIRED", daysLeft, crossedThreshold: null };

  const crossedThreshold = thresholds.find((threshold) => daysLeft <= threshold) ?? null;
  const widest = thresholds.length > 0 ? thresholds[thresholds.length - 1] : -1;

  let status: ExpiryStatus = "NORMAL";
  if (daysLeft <= criticalDays) status = "CRITICAL";
  else if (daysLeft <= widest) status = "WARNING";

  return { status, daysLeft, crossedThreshold };
}
