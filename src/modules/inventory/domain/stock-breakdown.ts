import type { CalendarDate } from "@/shared/domain/dates";
import { type LotState, effectiveLotStatus } from "./lot";

export interface StockBreakdown {
  /** Everything on the shelf: sum of current quantities. */
  physical: number;
  /** Units that cannot be dispensed because of a block, or a quarantined/blocked lot. */
  blocked: number;
  /** Units in lots whose expiry date has passed. */
  expired: number;
  /** physical - blocked - expired: what a normal exit can use. */
  available: number;
}

/**
 * Product stock derived from its lots (there is no denormalized counter).
 *
 * Each unit is counted in exactly one bucket so `available` can never go negative:
 * - expired lot (effective state): all its units are `expired`, whatever else is set on it;
 * - QUARANTINE / BLOCKED lot: all its units are `blocked`;
 * - otherwise only `blockedQuantity` is `blocked`, the rest is available.
 */
export function computeStockBreakdown(lots: readonly LotState[], today: CalendarDate): StockBreakdown {
  let physical = 0;
  let blocked = 0;
  let expired = 0;
  for (const lot of lots) {
    physical += lot.currentQuantity;
    const status = effectiveLotStatus(lot, today);
    if (status === "EXPIRED") expired += lot.currentQuantity;
    else if (status === "QUARANTINE" || status === "BLOCKED") blocked += lot.currentQuantity;
    else blocked += lot.blockedQuantity;
  }
  return { physical, blocked, expired, available: physical - blocked - expired };
}
