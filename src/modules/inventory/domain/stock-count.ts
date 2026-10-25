import type { CalendarDate } from "@/shared/domain/dates";
import type { LotState } from "./lot";
import { type MovementPlan, planAddition, planRemoval } from "./movement-rules";

/**
 * Physical counts. Opening a count snapshots the expected quantity of each lot; the user then enters
 * what is really on the shelf; closing reconciles with COMPENSATING movements (nothing is edited).
 */

/** Counted minus expected (positive = more than expected). Null while the lot is not counted yet. */
export function provisionalDifference(expectedQuantity: number, countedQuantity: number | null): number | null {
  return countedQuantity === null ? null : countedQuantity - expectedQuantity;
}

export interface CountLineQuantities {
  expectedQuantity: number;
  countedQuantity: number | null;
}

export interface CountSummary {
  total: number;
  counted: number;
  uncounted: number;
  /** Counted lots whose quantity differs from the expected one. */
  withDifference: number;
  /** Units found above the expectation / missing against it (both positive numbers). */
  unitsOver: number;
  unitsShort: number;
}

export function summarizeCount(lines: readonly CountLineQuantities[]): CountSummary {
  const summary: CountSummary = { total: lines.length, counted: 0, uncounted: 0, withDifference: 0, unitsOver: 0, unitsShort: 0 };
  for (const line of lines) {
    const difference = provisionalDifference(line.expectedQuantity, line.countedQuantity);
    if (difference === null) {
      summary.uncounted += 1;
      continue;
    }
    summary.counted += 1;
    if (difference > 0) summary.unitsOver += difference;
    if (difference < 0) summary.unitsShort += -difference;
    if (difference !== 0) summary.withDifference += 1;
  }
  return summary;
}

export interface CountCorrectionPlan {
  /** Counted minus what the lot holds now: positive is a COUNT_CORRECTION_IN, negative a COUNT_CORRECTION_OUT. */
  difference: number;
  /** Null when the counted quantity already matches the lot: nothing to correct. */
  plan: MovementPlan | null;
}

/**
 * The correction that makes the lot match the counted quantity, computed against the lot's CURRENT
 * quantity (not the snapshot): movements registered while the count was open are therefore never
 * counted twice. Expired lots are corrected too and keep their expired state (the date decides it).
 */
export function planCountCorrection(lot: LotState, countedQuantity: number, today: CalendarDate): CountCorrectionPlan {
  const difference = countedQuantity - lot.currentQuantity;
  if (difference === 0) return { difference, plan: null };
  const plan =
    difference > 0
      ? planAddition(lot, "COUNT_CORRECTION_IN", difference, today)
      : planRemoval(lot, "COUNT_CORRECTION_OUT", -difference, today);
  return { difference, plan };
}
