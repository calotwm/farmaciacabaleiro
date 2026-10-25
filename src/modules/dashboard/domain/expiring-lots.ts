import { type CalendarDate, addDays } from "@/shared/domain/dates";
import { DEFAULT_CRITICAL_DAYS, type ExpiryOptions, type ExpiryStatus, assessExpiry } from "@/shared/domain/expiry-status";

/** The hero lists lots that are expired or inside the critical expiry window (default 30 days). */
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
  /** Large figure shown on the card: "Vencido", "Hoy" or the number of days. */
  headline: string;
  /** Short text under the figure: "hace 12 días", "último día", "días". */
  caption: string;
}

const plural = (n: number) => (n === 1 ? "día" : "días");

/** How a lot's remaining time reads on a card (an expired lot says how long ago it expired). */
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

/** "Ver todos" target: lots with stock expiring up to the horizon, expired ones included. */
export function expiringLotsHref(today: CalendarDate, horizonDays: number = EXPIRING_HORIZON_DAYS): string {
  return `/lotes?expiryTo=${addDays(today, horizonDays)}&withStock=1`;
}
