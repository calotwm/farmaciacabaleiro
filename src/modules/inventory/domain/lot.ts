import { type CalendarDate, daysUntil } from "@/shared/domain/dates";
import { type ExpiryAssessment, type ExpiryOptions, assessExpiry } from "@/shared/domain/expiry-status";

export type LotStatus = "AVAILABLE" | "QUARANTINE" | "BLOCKED" | "EXPIRED" | "DEPLETED";

/** What the stock rules need to know about a lot. */
export interface LotState {
  id: string;
  productId: string;
  lotNumber: string;
  /** Valid through the END of this day (see docs/architecture.md). */
  expiryDate: CalendarDate;
  receivedAt: Date;
  currentQuantity: number;
  blockedQuantity: number;
  status: LotStatus;
}

/** Expired when today is after the expiry date: the lot is still valid on the expiry day itself. */
export function isExpired(expiryDate: CalendarDate, today: CalendarDate): boolean {
  return daysUntil(expiryDate, today) < 0;
}

/**
 * EXPIRED if the date has passed (whatever status is stored), otherwise the stored status.
 * The stored status is only a cache for what a worker or user decided; the date is the truth.
 */
export function effectiveLotStatus(lot: Pick<LotState, "expiryDate" | "status">, today: CalendarDate): LotStatus {
  return lot.status === "EXPIRED" || isExpired(lot.expiryDate, today) ? "EXPIRED" : lot.status;
}

/** Normal exits (dispensing) only take from AVAILABLE, non-expired lots. */
export function isUsableForExit(lot: Pick<LotState, "expiryDate" | "status">, today: CalendarDate): boolean {
  return effectiveLotStatus(lot, today) === "AVAILABLE";
}

/** Units a normal exit can take from this lot right now (on-hand minus individually blocked units). */
export function usableQuantity(lot: LotState, today: CalendarDate): number {
  return isUsableForExit(lot, today) ? Math.max(0, lot.currentQuantity - lot.blockedQuantity) : 0;
}

export interface LotDescription {
  effectiveStatus: LotStatus;
  expiry: ExpiryAssessment;
}

/** Everything a table needs to render a lot's status: effective state plus the expiry bucket. */
export function describeLot(
  lot: Pick<LotState, "expiryDate" | "status">,
  today: CalendarDate,
  options?: ExpiryOptions,
): LotDescription {
  return { effectiveStatus: effectiveLotStatus(lot, today), expiry: assessExpiry(lot.expiryDate, today, options) };
}
