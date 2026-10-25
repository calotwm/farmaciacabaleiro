import { type CalendarDate, addDays } from "@/shared/domain/dates";

export interface StockKpis {
  activeProducts: number;
  totalUnits: number;
  lowStock: number;
  outOfStock: number;
  /** Lots with stock expiring within N days (cumulative), widest window last. */
  expiring: { days: number; count: number }[];
  expiredWithStock: number;
}

export interface DeliveryKpis {
  today: number;
  next7Days: number;
  late: number;
  pendingConfirmation: number;
}

export type KpiTone = "default" | "warning" | "danger";

export interface KpiCard {
  id: string;
  label: string;
  value: number;
  href: string;
  tone: KpiTone;
  /** Extra links shown under the value (e.g. each expiry window). */
  breakdown?: { label: string; value: number; href: string }[];
}

const lotsExpiringHref = (today: CalendarDate, days: number) => `/lotes?expiryFrom=${today}&expiryTo=${addDays(today, days)}`;

/** Maps raw numbers to cards, each linking to the list filtered the same way the number was counted. */
export function buildStockCards(kpis: StockKpis, today: CalendarDate): KpiCard[] {
  const widest = kpis.expiring[kpis.expiring.length - 1];
  const expiringTotal = widest?.count ?? 0;
  return [
    { id: "products", label: "Productos activos", value: kpis.activeProducts, href: "/productos?status=ACTIVE", tone: "default" },
    { id: "units", label: "Unidades en stock", value: kpis.totalUnits, href: "/lotes", tone: "default" },
    { id: "low", label: "Stock bajo", value: kpis.lowStock, href: "/productos?stock=low", tone: kpis.lowStock > 0 ? "warning" : "default" },
    { id: "out", label: "Sin stock", value: kpis.outOfStock, href: "/productos?stock=out", tone: kpis.outOfStock > 0 ? "danger" : "default" },
    {
      id: "expiring",
      label: "Lotes por vencer",
      value: expiringTotal,
      href: widest ? lotsExpiringHref(today, widest.days) : "/lotes",
      tone: expiringTotal > 0 ? "warning" : "default",
      breakdown: kpis.expiring.map((window) => ({ label: `${window.days} días`, value: window.count, href: lotsExpiringHref(today, window.days) })),
    },
    {
      id: "expired",
      label: "Vencidos con stock",
      value: kpis.expiredWithStock,
      href: "/lotes?status=EXPIRED&withStock=1",
      tone: kpis.expiredWithStock > 0 ? "danger" : "default",
    },
  ];
}

export function buildDeliveryCards(kpis: DeliveryKpis, today: CalendarDate): KpiCard[] {
  return [
    { id: "deliveries-today", label: "Entregas de hoy", value: kpis.today, href: `/entregas?from=${today}&to=${today}&open=1`, tone: "default" },
    { id: "deliveries-week", label: "Próximos 7 días", value: kpis.next7Days, href: `/entregas?from=${today}&to=${addDays(today, 7)}&open=1`, tone: "default" },
    { id: "deliveries-late", label: "Entregas atrasadas", value: kpis.late, href: "/entregas?late=1", tone: kpis.late > 0 ? "danger" : "default" },
    {
      id: "deliveries-pending",
      label: "Pendientes de confirmar",
      value: kpis.pendingConfirmation,
      href: `/entregas?status=SCHEDULED&from=${today}`,
      tone: kpis.pendingConfirmation > 0 ? "warning" : "default",
    },
  ];
}
