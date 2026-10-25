import { type CalendarDate, addDays, daysInCalendarMonth, isoWeekday, splitCalendarDate, todayInTz } from "@/shared/domain/dates";

/** Month calendar math: weeks start on Monday, all days are AR calendar days. */

export const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;

export const WEEKDAY_NAMES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"] as const;
export const WEEKDAY_SHORT_NAMES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] as const;

/** "2026-11" as a typed value. */
export interface MonthRef {
  year: number;
  month: number;
}

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function parseMonth(value: string | undefined): MonthRef | null {
  const match = value ? MONTH_PATTERN.exec(value) : null;
  return match ? { year: Number(match[1]), month: Number(match[2]) } : null;
}

export function monthKey({ year, month }: MonthRef): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

/** The month of a calendar date. */
export function monthOf(date: CalendarDate): MonthRef {
  const { year, month } = splitCalendarDate(date);
  return { year, month };
}

export function shiftMonth({ year, month }: MonthRef, delta: number): MonthRef {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export function monthLabel({ year, month }: MonthRef): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/** "Lunes 26 de octubre". */
export function formatLongDay(date: CalendarDate): string {
  const { month, day } = splitCalendarDate(date);
  return `${WEEKDAY_NAMES[isoWeekday(date) - 1]} ${day} de ${MONTH_NAMES[month - 1].toLowerCase()}`;
}

/** Weeks (Monday first) covering the month, padded with the neighbouring months' days. */
export function buildMonthGrid({ year, month }: MonthRef): CalendarDate[][] {
  const first = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`;
  const last = addDays(first, daysInCalendarMonth(year, month) - 1);
  const start = addDays(first, -(isoWeekday(first) - 1));
  const end = addDays(last, 7 - isoWeekday(last));
  const weeks: CalendarDate[][] = [];
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, offset) => addDays(cursor, offset)));
  }
  return weeks;
}

/** First visible day and the day after the last one (exclusive end) of a month grid. */
export function gridRange(month: MonthRef): { from: CalendarDate; toExclusive: CalendarDate } {
  const weeks = buildMonthGrid(month);
  return { from: weeks[0][0], toExclusive: addDays(weeks[weeks.length - 1][6], 1) };
}

/** Groups items by the AR calendar day of their scheduled instant, keeping the input order within a day. */
export function groupByDay<T extends { scheduledAt: Date }>(items: readonly T[]): Map<CalendarDate, T[]> {
  const groups = new Map<CalendarDate, T[]>();
  for (const item of items) {
    const day = todayInTz(item.scheduledAt);
    groups.set(day, [...(groups.get(day) ?? []), item]);
  }
  return groups;
}
