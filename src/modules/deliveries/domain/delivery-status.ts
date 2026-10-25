import { ConflictError } from "@/shared/domain/errors";

export const DELIVERY_TYPES = ["DELIVERY", "SALES_VISIT", "ORDER_TAKING", "OTHER"] as const;
export type DeliveryType = (typeof DELIVERY_TYPES)[number];

export const DELIVERY_STATUSES = ["SCHEDULED", "CONFIRMED", "RECEIVED", "RESCHEDULED", "CANCELLED", "COMPLETED"] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export const DELIVERY_TYPE_LABELS: Record<DeliveryType, string> = {
  DELIVERY: "Reparto",
  SALES_VISIT: "Visita comercial",
  ORDER_TAKING: "Toma de pedidos",
  OTHER: "Otro",
};

/** Only a "Reparto" brings goods: it is the only type that can be received through a receipt. */
export function isGoodsDelivery(type: DeliveryType): boolean {
  return type === "DELIVERY";
}

/** Spanish label of a status. "Recibida" is only reachable by a delivery, "Realizada" only by visits. */
export function deliveryStatusLabel(status: DeliveryStatus): string {
  switch (status) {
    case "SCHEDULED":
      return "Programada";
    case "CONFIRMED":
      return "Confirmada";
    case "RECEIVED":
      return "Recibida";
    case "RESCHEDULED":
      return "Reprogramada";
    case "CANCELLED":
      return "Cancelada";
    case "COMPLETED":
      return "Realizada";
  }
}

/** Statuses that are still waiting to happen. */
export const OPEN_DELIVERY_STATUSES = ["SCHEDULED", "CONFIRMED"] as const satisfies readonly DeliveryStatus[];

export function isOpenDelivery(status: DeliveryStatus): boolean {
  return status === "SCHEDULED" || status === "CONFIRMED";
}

/**
 * Status machine. A delivery (type DELIVERY) ends as RECEIVED, only through a receipt; any other type
 * ends as COMPLETED ("realizada"). RECEIVED, COMPLETED, CANCELLED and RESCHEDULED are terminal: a
 * reschedule creates a NEW delivery linked to the original, so the history is never rewritten.
 */
export function allowedTransitions(status: DeliveryStatus, type: DeliveryType): DeliveryStatus[] {
  if (!isOpenDelivery(status)) return [];
  const outcome: DeliveryStatus = isGoodsDelivery(type) ? "RECEIVED" : "COMPLETED";
  const targets: DeliveryStatus[] = ["CONFIRMED", outcome, "RESCHEDULED", "CANCELLED"];
  return status === "CONFIRMED" ? targets.filter((target) => target !== "CONFIRMED") : targets;
}

export function canTransition(from: DeliveryStatus, to: DeliveryStatus, type: DeliveryType): boolean {
  return allowedTransitions(from, type).includes(to);
}

export function assertTransition(from: DeliveryStatus, to: DeliveryStatus, type: DeliveryType): void {
  if (canTransition(from, to, type)) return;
  const wrongOutcome = (to === "RECEIVED" && !isGoodsDelivery(type)) || (to === "COMPLETED" && isGoodsDelivery(type));
  const message = wrongOutcome
    ? isGoodsDelivery(type)
      ? "Una entrega se cierra al recibir la mercadería, no se marca como realizada."
      : "Solo un reparto puede recibirse. Las visitas se marcan como realizadas."
    : !isOpenDelivery(from)
      ? `La entrega ya está ${deliveryStatusLabel(from).toLowerCase()} y no admite más cambios.`
      : `No se puede pasar de ${deliveryStatusLabel(from).toLowerCase()} a ${deliveryStatusLabel(to).toLowerCase()}.`;
  throw new ConflictError(`Invalid delivery transition ${from} -> ${to}`, message);
}
