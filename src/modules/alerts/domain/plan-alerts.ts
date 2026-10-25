import { deliveryReminderDue } from "@/modules/deliveries/domain/reminders";
import { type DeliveryStatus, isOpenDelivery } from "@/modules/deliveries/domain/delivery-status";
import { type CalendarDate, daysUntil, formatDate, formatDateTime, todayInTz } from "@/shared/domain/dates";
import { assessExpiry } from "@/shared/domain/expiry-status";

export type AlertRuleKey = "LOT_EXPIRY_THRESHOLD" | "LOT_EXPIRED_WITH_STOCK" | "DELIVERY_UPCOMING" | "DELIVERY_LATE";
export type Priority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface LotForAlerts {
  id: string;
  lotNumber: string;
  expiryDate: CalendarDate;
  currentQuantity: number;
  productName: string;
}

export interface DeliveryForAlerts {
  id: string;
  scheduledAt: Date;
  status: DeliveryStatus;
  supplierName: string;
}

/** One alert to raise. (rule, entityType, entityId, thresholdKey, eventDate) is its idempotency key. */
export interface AlertCandidate {
  rule: AlertRuleKey;
  entityType: "lot" | "delivery";
  entityId: string;
  thresholdKey: string;
  eventDate: CalendarDate;
  title: string;
  body: string;
  priority: Priority;
  link: string;
  payload: Record<string, string | number>;
}

export function alertKey(c: { rule: string; entityType: string; entityId: string; thresholdKey: string; eventDate: string }): string {
  return [c.rule, c.entityType, c.entityId, c.thresholdKey, c.eventDate].join("|");
}

function units(quantity: number): string {
  return `${quantity} ${quantity === 1 ? "unidad" : "unidades"}`;
}

function thresholdPriority(days: number): Priority {
  if (days <= 7) return "HIGH";
  if (days <= 30) return "MEDIUM";
  return "LOW";
}

/**
 * Lot alerts, fired ONCE EVER per lot and threshold: `eventDate` is the lot's expiry date, so the key never
 * changes from one day to the next. Only the tightest threshold the lot has reached is raised (a lot received
 * with 20 days left raises "30", not 180/90/60/30); crossing the next one later raises that one.
 * Lots without stock raise nothing.
 */
export function planLotAlerts(lots: readonly LotForAlerts[], today: CalendarDate, thresholds: readonly number[]): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  for (const lot of lots) {
    if (lot.currentQuantity <= 0) continue;
    const link = `/lotes/${lot.id}`;
    const days = daysUntil(lot.expiryDate, today);
    if (days < 0) {
      out.push({
        rule: "LOT_EXPIRED_WITH_STOCK",
        entityType: "lot",
        entityId: lot.id,
        thresholdKey: "",
        eventDate: lot.expiryDate,
        title: `Vencido con stock: ${lot.productName}`,
        body: `El lote ${lot.lotNumber} venció el ${formatDate(lot.expiryDate)} y todavía tiene ${units(lot.currentQuantity)}.`,
        priority: "CRITICAL",
        link,
        payload: { lotId: lot.id, lotNumber: lot.lotNumber, quantity: lot.currentQuantity },
      });
      continue;
    }
    const threshold = assessExpiry(lot.expiryDate, today, { thresholds }).crossedThreshold;
    if (threshold === null) continue;
    const when = days === 0 ? "vence hoy" : days === 1 ? "vence mañana" : `vence en ${days} días`;
    out.push({
      rule: "LOT_EXPIRY_THRESHOLD",
      entityType: "lot",
      entityId: lot.id,
      thresholdKey: String(threshold),
      eventDate: lot.expiryDate,
      title: `Por vencer: ${lot.productName}`,
      body: `El lote ${lot.lotNumber} ${when} (${formatDate(lot.expiryDate)}) y tiene ${units(lot.currentQuantity)}.`,
      priority: thresholdPriority(threshold),
      link,
      payload: { lotId: lot.id, lotNumber: lot.lotNumber, quantity: lot.currentQuantity, threshold, daysLeft: days },
    });
  }
  return out;
}

/**
 * Delivery alerts: the reminders due today (`deliveryReminderDue`) and, once per delivery, "late" when an open
 * delivery's time has passed. `eventDate` is the scheduled AR day, stable across runs.
 */
export function planDeliveryAlerts(deliveries: readonly DeliveryForAlerts[], now: Date): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  for (const delivery of deliveries) {
    const scheduledDay = todayInTz(delivery.scheduledAt);
    const link = `/entregas/${delivery.id}`;
    const at = formatDateTime(delivery.scheduledAt);
    if (isOpenDelivery(delivery.status) && delivery.scheduledAt.getTime() < now.getTime()) {
      out.push({
        rule: "DELIVERY_LATE",
        entityType: "delivery",
        entityId: delivery.id,
        thresholdKey: "",
        eventDate: scheduledDay,
        title: `Entrega atrasada: ${delivery.supplierName}`,
        body: `Estaba programada para el ${at} y sigue pendiente.`,
        priority: "HIGH",
        link,
        payload: { deliveryId: delivery.id, scheduledAt: delivery.scheduledAt.toISOString() },
      });
      continue;
    }
    for (const reminder of deliveryReminderDue(delivery, now)) {
      out.push({
        rule: "DELIVERY_UPCOMING",
        entityType: "delivery",
        entityId: delivery.id,
        thresholdKey: reminder.thresholdKey,
        eventDate: scheduledDay,
        title: `Entrega ${reminder.daysBefore === 0 ? "hoy" : reminder.daysBefore === 1 ? "mañana" : `en ${reminder.daysBefore} días`}: ${delivery.supplierName}`,
        body: `Programada para el ${at}.`,
        priority: reminder.daysBefore === 0 ? "HIGH" : "MEDIUM",
        link,
        payload: { deliveryId: delivery.id, scheduledAt: delivery.scheduledAt.toISOString(), daysBefore: reminder.daysBefore },
      });
    }
  }
  return out;
}
