import { todayInTz } from "@/shared/domain/dates";
import type { DeliveryStatus, DeliveryType } from "./delivery-status";

/** One scheduled delivery with the instant its (last) receipt was confirmed, if any. */
export interface ComplianceRow {
  supplierId: string;
  type: DeliveryType;
  status: DeliveryStatus;
  scheduledAt: Date;
  receivedAt: Date | null;
}

export interface ComplianceSummary {
  /** Deliveries ("Reparto") scheduled in the period. Visits are not counted. */
  scheduled: number;
  /** Received on the scheduled AR day or before. */
  onTime: number;
  /** Received after the scheduled AR day. */
  receivedLate: number;
  rescheduled: number;
  cancelled: number;
  /** Still open and past their scheduled time. */
  overdue: number;
  /** Still open and not yet due: too early to judge, excluded from the percentage. */
  pending: number;
  /** onTime / (scheduled - pending), rounded; null when nothing has concluded yet. */
  onTimePercentage: number | null;
}

export const EMPTY_COMPLIANCE: ComplianceSummary = {
  scheduled: 0,
  onTime: 0,
  receivedLate: 0,
  rescheduled: 0,
  cancelled: 0,
  overdue: 0,
  pending: 0,
  onTimePercentage: null,
};

/**
 * Supplier compliance over deliveries of type DELIVERY. "On time" means the receipt was confirmed on the
 * scheduled day (AR calendar day) or before; a partial delivery counts at the confirmation that completed it.
 * Open deliveries that are not yet due are `pending` and left out of the percentage; open ones past
 * their time are `overdue` and count against it. A reschedule counts as not delivered on that date.
 */
export function computeCompliance(rows: readonly ComplianceRow[], now: Date): ComplianceSummary {
  const summary = { ...EMPTY_COMPLIANCE };
  for (const row of rows) {
    // Visits are not deliveries (COMPLETED is a visit outcome and never applies to a delivery).
    if (row.type !== "DELIVERY" || row.status === "COMPLETED") continue;
    summary.scheduled++;
    switch (row.status) {
      case "RECEIVED": {
        // A received delivery without a receipt date cannot be proven late: it is not held against the supplier.
        const late = row.receivedAt !== null && todayInTz(row.receivedAt) > todayInTz(row.scheduledAt);
        if (late) summary.receivedLate++;
        else summary.onTime++;
        break;
      }
      case "RESCHEDULED":
        summary.rescheduled++;
        break;
      case "CANCELLED":
        summary.cancelled++;
        break;
      case "SCHEDULED":
      case "CONFIRMED":
        if (row.scheduledAt.getTime() < now.getTime()) summary.overdue++;
        else summary.pending++;
        break;
    }
  }
  const judged = summary.scheduled - summary.pending;
  summary.onTimePercentage = judged > 0 ? Math.round((summary.onTime / judged) * 100) : null;
  return summary;
}

/** Compliance per supplier id. */
export function computeComplianceBySupplier(rows: readonly ComplianceRow[], now: Date): Map<string, ComplianceSummary> {
  const grouped = new Map<string, ComplianceRow[]>();
  for (const row of rows) grouped.set(row.supplierId, [...(grouped.get(row.supplierId) ?? []), row]);
  return new Map([...grouped].map(([supplierId, supplierRows]) => [supplierId, computeCompliance(supplierRows, now)]));
}
