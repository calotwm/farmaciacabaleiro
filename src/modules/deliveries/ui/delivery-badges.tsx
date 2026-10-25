import { Badge } from "@/components/ui/badge";
import { cn } from "@/shared/lib/utils";
import { DELIVERY_ALERT_LABELS, type DeliveryAlertState } from "../domain/delivery-schedule";
import { DELIVERY_TYPE_LABELS, type DeliveryStatus, type DeliveryType, deliveryStatusLabel, isGoodsDelivery } from "../domain/delivery-status";

/** Status colors (also used for the calendar items). The label always carries the meaning: color is a hint. */
export const DELIVERY_STATUS_CLASSES: Record<DeliveryStatus, string> = {
  SCHEDULED: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  CONFIRMED: "bg-indigo-100 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200",
  RECEIVED: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  COMPLETED: "bg-teal-100 text-teal-900 dark:bg-teal-950 dark:text-teal-200",
  RESCHEDULED: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  CANCELLED: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

export function DeliveryStatusBadge({ status }: { status: DeliveryStatus }) {
  return (
    <Badge variant="outline" className={cn("border-transparent", DELIVERY_STATUS_CLASSES[status])}>
      {deliveryStatusLabel(status)}
    </Badge>
  );
}

/** "Reparto" is a solid badge, a visit an outlined one: they must never look alike. */
export function DeliveryTypeBadge({ type }: { type: DeliveryType }) {
  return <Badge variant={isGoodsDelivery(type) ? "secondary" : "outline"}>{DELIVERY_TYPE_LABELS[type]}</Badge>;
}

export function DeliveryAlertBadge({ alert }: { alert: DeliveryAlertState | null }) {
  if (!alert) return null;
  return <Badge variant={alert === "LATE" ? "destructive" : "outline"}>{DELIVERY_ALERT_LABELS[alert]}</Badge>;
}
