import type { CalendarDate } from "@/shared/domain/dates";
import { InsufficientStockError } from "./errors";
import { type LotState, isUsableForExit, usableQuantity } from "./lot";

/** A lot that can serve a normal exit, with the units it can still give. */
export interface FefoCandidate {
  id: string;
  lotNumber: string;
  expiryDate: CalendarDate;
  receivedAt: Date;
  available: number;
}

export interface LotAllocation {
  lotId: string;
  lotNumber: string;
  quantity: number;
}

/** First-expired-first-out: earliest expiry, then oldest receipt, then lot number. */
export function compareFefo(
  a: Pick<LotState, "expiryDate" | "receivedAt" | "lotNumber">,
  b: Pick<LotState, "expiryDate" | "receivedAt" | "lotNumber">,
): number {
  // ISO calendar dates compare correctly as strings.
  if (a.expiryDate !== b.expiryDate) return a.expiryDate < b.expiryDate ? -1 : 1;
  if (a.receivedAt.getTime() !== b.receivedAt.getTime()) return a.receivedAt.getTime() - b.receivedAt.getTime();
  if (a.lotNumber !== b.lotNumber) return a.lotNumber < b.lotNumber ? -1 : 1;
  return 0;
}

export function sortFefo<T extends Pick<LotState, "expiryDate" | "receivedAt" | "lotNumber">>(lots: readonly T[]): T[] {
  return [...lots].sort(compareFefo);
}

/** Lots a normal exit may draw from (AVAILABLE, not expired, with usable units), in FEFO order. */
export function toFefoCandidates(lots: readonly LotState[], today: CalendarDate): FefoCandidate[] {
  return sortFefo(lots)
    .map((lot) => ({
      id: lot.id,
      lotNumber: lot.lotNumber,
      expiryDate: lot.expiryDate,
      receivedAt: lot.receivedAt,
      available: usableQuantity(lot, today),
    }))
    .filter((candidate) => candidate.available > 0);
}

/** The lot shown as "Usar primero": the earliest-expiring one that can serve a normal exit. */
export function firstUsableLot<T extends LotState>(lots: readonly T[], today: CalendarDate): T | null {
  return sortFefo(lots).find((lot) => isUsableForExit(lot, today) && usableQuantity(lot, today) > 0) ?? null;
}

/**
 * Splits `quantity` over the candidates from the earliest expiry on. Throws `InsufficientStockError`
 * (stating how many units are available) when the candidates cannot cover it.
 */
export function allocateFefo(candidates: readonly FefoCandidate[], quantity: number): LotAllocation[] {
  const ordered = sortFefo(candidates);
  const available = ordered.reduce((sum, candidate) => sum + candidate.available, 0);
  if (quantity > available) throw new InsufficientStockError(available, quantity);

  const allocations: LotAllocation[] = [];
  let remaining = quantity;
  for (const candidate of ordered) {
    if (remaining === 0) break;
    const take = Math.min(candidate.available, remaining);
    if (take <= 0) continue;
    allocations.push({ lotId: candidate.id, lotNumber: candidate.lotNumber, quantity: take });
    remaining -= take;
  }
  return allocations;
}
