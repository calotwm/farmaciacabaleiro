import { type CalendarDate, addDays, daysInCalendarMonth, splitCalendarDate } from "@/shared/domain/dates";
import { DEFAULT_CRITICAL_DAYS } from "@/shared/domain/expiry-status";

/** Cumulative expiry windows offered next to the expired bucket: <=7 days, <=30 days and the widest configured threshold. */
export const SHORT_WINDOW_DAYS = 7;

export type ExpirationBucketId = "expired" | `d${number}`;

export interface ExpirationBucket {
  id: ExpirationBucketId;
  label: string;
  /** Window size in days; null for the expired bucket. */
  days: number | null;
}

/** Expired lots with stock plus the cumulative windows (7, 30 and `maxDays`, deduplicated, ascending). */
export function expirationBuckets(maxDays: number): ExpirationBucket[] {
  const windows = [...new Set([SHORT_WINDOW_DAYS, DEFAULT_CRITICAL_DAYS, Math.max(maxDays, 1)])].sort((a, b) => a - b);
  return [
    { id: "expired", label: "Vencidos con stock", days: null },
    ...windows.map((days): ExpirationBucket => ({ id: `d${days}`, label: `Vencen en ≤${days} días`, days })),
  ];
}

/** The bucket named by a URL param, falling back to the first window (<=7 days) when it is missing or unknown. */
export function resolveBucket(buckets: readonly ExpirationBucket[], id: string | undefined): ExpirationBucket {
  return buckets.find((bucket) => bucket.id === id) ?? buckets[1] ?? buckets[0]!;
}

/** The lot-list filters that select a bucket (the same ones the list, the summary and the CSV export use). */
export function bucketFilters(bucket: ExpirationBucket, today: CalendarDate): { status: "" | "EXPIRED"; expiryFrom?: CalendarDate; expiryTo?: CalendarDate } {
  if (bucket.days === null) return { status: "EXPIRED" };
  return { status: "", expiryFrom: today, expiryTo: addDays(today, bucket.days) };
}

export interface MonthRange {
  /** "2026-10" */
  key: string;
  /** First day counted: today for the current month, the 1st for later ones. */
  from: CalendarDate;
  /** Last day of the month. */
  to: CalendarDate;
  /** "oct 2026" */
  label: string;
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"] as const;

const pad = (value: number) => String(value).padStart(2, "0");

/** The current month (from today) followed by the next `count - 1` calendar months. */
export function upcomingMonths(today: CalendarDate, count: number): MonthRange[] {
  const start = splitCalendarDate(today);
  return Array.from({ length: count }, (_, index) => {
    const offset = start.month - 1 + index;
    const year = start.year + Math.floor(offset / 12);
    const month = (offset % 12) + 1;
    const key = `${year}-${pad(month)}`;
    return {
      key,
      from: index === 0 ? today : `${key}-01`,
      to: `${key}-${pad(daysInCalendarMonth(year, month))}`,
      label: `${MONTHS[month - 1]} ${year}`,
    };
  });
}
