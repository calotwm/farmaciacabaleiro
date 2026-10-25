import { Prisma } from "@/generated/prisma/client";
import { type CalendarDate, addDays, fromDbDate, startOfDayInTz, toDbDate } from "@/shared/domain/dates";
import { productStockLevels } from "@/shared/infrastructure/db/stock-level-sql";
import type { DbClient } from "@/shared/infrastructure/db/types";
import type { ExpiringLotRow } from "../domain/expiring-lots";
import type { DeliveryKpis, StockKpis } from "../domain/kpi-cards";

const OPEN = ["SCHEDULED", "CONFIRMED"] as const;

/** Read side of the dashboard: counts are aggregated in SQL, lists are small bounded queries. */
export class PrismaDashboardReads {
  constructor(private readonly db: DbClient) {}

  async stockKpis(today: CalendarDate, thresholds: readonly number[]): Promise<StockKpis> {
    const todayDate = toDbDate(today);
    const windows = [...thresholds].sort((a, b) => a - b);
    const [levels, units, expired, ...expiring] = await Promise.all([
      this.db.$queryRaw<{ total: number; out: number; low: number }[]>(Prisma.sql`
        WITH levels AS (${productStockLevels(today)})
        SELECT count(*)::int AS total,
               (count(*) FILTER (WHERE available <= 0))::int AS "out",
               (count(*) FILTER (WHERE available > 0 AND available <= min_stock))::int AS low
        FROM levels`),
      this.db.lot.aggregate({ _sum: { currentQuantity: true }, where: { product: { status: "ACTIVE" } } }),
      this.db.lot.count({ where: { currentQuantity: { gt: 0 }, OR: [{ expiryDate: { lt: todayDate } }, { status: "EXPIRED" }] } }),
      ...windows.map((days) =>
        this.db.lot.count({ where: { currentQuantity: { gt: 0 }, expiryDate: { gte: todayDate, lte: toDbDate(addDays(today, days)) } } }),
      ),
    ]);
    const row = levels[0] ?? { total: 0, out: 0, low: 0 };
    return {
      activeProducts: row.total,
      totalUnits: units._sum.currentQuantity ?? 0,
      lowStock: row.low,
      outOfStock: row.out,
      expiring: windows.map((days, index) => ({ days, count: expiring[index] ?? 0 })),
      expiredWithStock: expired,
    };
  }

  async deliveryKpis(now: Date, today: CalendarDate): Promise<DeliveryKpis> {
    const dayStart = startOfDayInTz(today);
    const count = (where: Prisma.ScheduledDeliveryWhereInput) => this.db.scheduledDelivery.count({ where });
    const [todayCount, next7Days, late, pendingConfirmation] = await Promise.all([
      count({ status: { in: [...OPEN] }, scheduledAt: { gte: dayStart, lt: startOfDayInTz(addDays(today, 1)) } }),
      count({ status: { in: [...OPEN] }, scheduledAt: { gte: dayStart, lt: startOfDayInTz(addDays(today, 8)) } }),
      count({ status: { in: [...OPEN] }, scheduledAt: { lt: now } }),
      count({ status: "SCHEDULED", scheduledAt: { gte: dayStart } }),
    ]);
    return { today: todayCount, next7Days, late, pendingConfirmation };
  }

  /** Lots with stock that are expired or expire within `horizonDays`, soonest first (expired lots lead). */
  async expiringLots(today: CalendarDate, horizonDays: number, take: number) {
    const where = { currentQuantity: { gt: 0 }, expiryDate: { lte: toDbDate(addDays(today, horizonDays)) } };
    const [total, lots] = await Promise.all([
      this.db.lot.count({ where }),
      this.db.lot.findMany({
        where,
        orderBy: [{ expiryDate: "asc" }, { id: "asc" }],
        take,
        select: {
          id: true,
          lotNumber: true,
          expiryDate: true,
          currentQuantity: true,
          product: { select: { id: true, commercialName: true } },
        },
      }),
    ]);
    const rows: ExpiringLotRow[] = lots.map((lot) => ({
      id: lot.id,
      lotNumber: lot.lotNumber,
      expiryDate: fromDbDate(lot.expiryDate),
      quantity: lot.currentQuantity,
      product: lot.product,
    }));
    return { total, rows };
  }

  latestMovements(take: number) {
    return this.db.stockMovement.findMany({
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take,
      select: {
        id: true,
        type: true,
        quantity: true,
        occurredAt: true,
        product: { select: { id: true, commercialName: true } },
        lot: { select: { lotNumber: true } },
      },
    });
  }

  async unreadNotifications(userId: string, take: number) {
    const where = { userId, readAt: null };
    const [total, items] = await Promise.all([
      this.db.notification.count({ where }),
      this.db.notification.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take,
        select: { id: true, title: true, body: true, priority: true, link: true, createdAt: true },
      }),
    ]);
    return { total, items };
  }
}
