import { type DeliveryStatus, isOpenDelivery } from "./delivery-status";

/** The part of a delivery the time rules need. */
export interface ScheduledItem {
  scheduledAt: Date;
  status: DeliveryStatus;
}

/** A SCHEDULED delivery inside this window (and not yet due) still needs the supplier's confirmation. */
export const CONFIRMATION_WINDOW_HOURS = 48;

const MS_PER_HOUR = 3_600_000;

/** "Atrasada": the scheduled instant has passed and the delivery is still open (SCHEDULED or CONFIRMED). */
export function isLate(item: ScheduledItem, now: Date): boolean {
  return isOpenDelivery(item.status) && item.scheduledAt.getTime() < now.getTime();
}

/** "Pendiente de confirmar": SCHEDULED (not confirmed) and due within the next 48 hours. */
export function needsConfirmation(item: ScheduledItem, now: Date, windowHours: number = CONFIRMATION_WINDOW_HOURS): boolean {
  if (item.status !== "SCHEDULED") return false;
  const delta = item.scheduledAt.getTime() - now.getTime();
  return delta >= 0 && delta <= windowHours * MS_PER_HOUR;
}

export type DeliveryAlertState = "LATE" | "PENDING_CONFIRMATION";

/** The derived badge of a delivery, if any (late wins: it is the one that needs action first). */
export function deliveryAlertState(item: ScheduledItem, now: Date): DeliveryAlertState | null {
  if (isLate(item, now)) return "LATE";
  return needsConfirmation(item, now) ? "PENDING_CONFIRMATION" : null;
}

export const DELIVERY_ALERT_LABELS: Record<DeliveryAlertState, string> = {
  LATE: "Atrasada",
  PENDING_CONFIRMATION: "Pendiente de confirmar",
};
