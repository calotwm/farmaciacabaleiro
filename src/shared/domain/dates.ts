import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";

/**
 * Date rules (see docs/architecture.md):
 * - Expiry and event dates are CALENDAR DATES (no time, no zone), modelled as
 *   `CalendarDate` strings ("YYYY-MM-DD") and stored in Postgres as DATE.
 * - A lot expires at the END of its stated day: it is still valid on the expiry
 *   date and expired from the next day on.
 * - "Today" is the calendar date in the pharmacy timezone, never the server's.
 * - Instants (Date) are shown in the pharmacy timezone; calendar dates are
 *   formatted without any timezone conversion.
 */

export const DEFAULT_TIMEZONE = "America/Argentina/Buenos_Aires";

/** A calendar date as "YYYY-MM-DD". Use the helpers below to create one. */
export type CalendarDate = string;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DISPLAY_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const MONTH_YEAR = /^(\d{1,2})\/(\d{4})$/;
const MS_PER_DAY = 86_400_000;

function pad(value: number, width = 2): string {
  return String(value).padStart(width, "0");
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function buildCalendarDate(year: number, month: number, day: number): CalendarDate | null {
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

function toParts(date: CalendarDate): { year: number; month: number; day: number } {
  const match = ISO_DATE.exec(date);
  if (!match || !buildCalendarDate(Number(match[1]), Number(match[2]), Number(match[3]))) {
    throw new RangeError(`Invalid calendar date: ${date}`);
  }
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function toEpochDay(date: CalendarDate): number {
  const { year, month, day } = toParts(date);
  return Date.UTC(year, month - 1, day) / MS_PER_DAY;
}

export function isValidCalendarDate(value: string): value is CalendarDate {
  const match = ISO_DATE.exec(value);
  return !!match && buildCalendarDate(Number(match[1]), Number(match[2]), Number(match[3])) !== null;
}

/** The calendar date of an instant in the given timezone (server TZ is irrelevant). */
export function todayInTz(now: Date = new Date(), timeZone: string = DEFAULT_TIMEZONE): CalendarDate {
  const local = new TZDate(now, timeZone);
  return `${pad(local.getFullYear(), 4)}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}`;
}

/** Whole days from `today` to `expiryDate`: 0 on the expiry day, negative once expired. */
export function daysUntil(expiryDate: CalendarDate, today: CalendarDate): number {
  return toEpochDay(expiryDate) - toEpochDay(today);
}

export function addDays(date: CalendarDate, days: number): CalendarDate {
  const next = new Date((toEpochDay(date) + days) * MS_PER_DAY);
  return `${pad(next.getUTCFullYear(), 4)}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

/** The instant at which a calendar date starts (00:00) in the given timezone. */
export function startOfDayInTz(date: CalendarDate, timeZone: string = DEFAULT_TIMEZONE): Date {
  const { year, month, day } = toParts(date);
  return new Date(new TZDate(year, month - 1, day, 0, 0, 0, 0, timeZone).getTime());
}

/** DD/MM/AAAA, without any timezone conversion. */
export function formatDate(date: CalendarDate): string {
  const { year, month, day } = toParts(date);
  return `${pad(day)}/${pad(month)}/${pad(year, 4)}`;
}

/** DD/MM/AAAA HH:mm for an instant, rendered in the pharmacy timezone. */
export function formatDateTime(instant: Date, timeZone: string = DEFAULT_TIMEZONE): string {
  return format(new TZDate(instant, timeZone), "dd/MM/yyyy HH:mm");
}

/** Strict DD/MM/AAAA parser: returns null for malformed or impossible dates (e.g. 31/02). */
export function parseDisplayDate(input: string): CalendarDate | null {
  const match = DISPLAY_DATE.exec(input.trim());
  if (!match) return null;
  return buildCalendarDate(Number(match[3]), Number(match[2]), Number(match[1]));
}

/** MM/AAAA -> last day of that month (the lot is valid through that whole day). */
export function expiryFromMonthYear(input: string): CalendarDate | null {
  const match = MONTH_YEAR.exec(input.trim());
  if (!match) return null;
  const month = Number(match[1]);
  const year = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return buildCalendarDate(year, month, daysInMonth(year, month));
}

/** Prisma DATE columns come back as a Date at UTC midnight. */
export function fromDbDate(value: Date): CalendarDate {
  return `${pad(value.getUTCFullYear(), 4)}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
}

/** CalendarDate -> Date at UTC midnight, the shape Prisma expects for DATE columns. */
export function toDbDate(date: CalendarDate): Date {
  const { year, month, day } = toParts(date);
  return new Date(Date.UTC(year, month - 1, day));
}
