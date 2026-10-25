import type { CalendarDate } from "@/shared/domain/dates";
import { DEFAULT_CRITICAL_DAYS, type ExpiryOptions, type ExpiryStatus, assessExpiry } from "@/shared/domain/expiry-status";

/** The dashboard lists lots inside the critical expiry window (default 30 days); expired ones have their own panel. */
export const EXPIRING_HORIZON_DAYS = DEFAULT_CRITICAL_DAYS;
/** At or below this many days (or already expired) a lot is shown as urgent (red); otherwise amber. */
export const URGENT_DAYS = 7;

export interface ExpiringLotRow {
  id: string;
  lotNumber: string;
  expiryDate: CalendarDate;
  quantity: number;
  product: { id: string; commercialName: string };
}

export interface ExpiringLotItem extends ExpiringLotRow {
  status: ExpiryStatus;
  tone: "danger" | "warning";
  daysLeft: number;
  /** Short figure: "Vencido", "Hoy" or the number of days. */
  headline: string;
  /** Short text after the figure: "hace 12 días", "último día", "días". */
  caption: string;
}

const plural = (n: number) => (n === 1 ? "día" : "días");

/** How a lot's remaining time reads (an expired lot says how long ago it expired). */
export function describeDaysLeft(daysLeft: number): Pick<ExpiringLotItem, "headline" | "caption"> {
  if (daysLeft < 0) return { headline: "Vencido", caption: `hace ${-daysLeft} ${plural(-daysLeft)}` };
  if (daysLeft === 0) return { headline: "Hoy", caption: "último día" };
  return { headline: String(daysLeft), caption: plural(daysLeft) };
}

/** Classifies each lot with the shared expiry rules and sorts by expiry ascending (expired first). */
export function buildExpiringLots(rows: ExpiringLotRow[], today: CalendarDate, options: ExpiryOptions = {}): ExpiringLotItem[] {
  return rows
    .map((row): ExpiringLotItem => {
      const { status, daysLeft } = assessExpiry(row.expiryDate, today, options);
      return { ...row, status, daysLeft, tone: daysLeft <= URGENT_DAYS ? "danger" : "warning", ...describeDaysLeft(daysLeft) };
    })
    .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate) || a.id.localeCompare(b.id));
}

