import { Badge } from "@/components/ui/badge";
import { cn } from "@/shared/lib/utils";
import { DELIVERY_ALERT_LABELS, type DeliveryAlertState } from "../domain/delivery-schedule";
import { DELIVERY_TYPE_LABELS, type DeliveryStatus, type DeliveryType, deliveryStatusLabel, isGoodsDelivery } from "../domain/delivery-status";

/** Status colors (also used for the calendar items). The label always carries the meaning: color is a hint. */
export const DELIVERY_STATUS_CLASSES: Record<DeliveryStatus, string> = {
  SCHEDULED: "bg-muted text-foreground",
  CONFIRMED: "bg-success-soft text-success-soft-foreground",
  RECEIVED: "bg-success-soft text-success-soft-foreground",
  COMPLETED: "bg-success-soft text-success-soft-foreground",
  RESCHEDULED: "bg-warning-soft text-warning-soft-foreground",
  CANCELLED: "bg-muted text-muted-foreground line-through",
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
