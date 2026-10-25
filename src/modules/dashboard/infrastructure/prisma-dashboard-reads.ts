import { Prisma } from "@/generated/prisma/client";
import { type CalendarDate, addDays, fromDbDate, startOfDayInTz, toDbDate } from "@/shared/domain/dates";
import { productStockLevels } from "@/shared/infrastructure/db/stock-level-sql";
import type { DbClient } from "@/shared/infrastructure/db/types";
import type { ExpiringLotRow } from "../domain/expiring-lots";
import type { LowStockRow, UpcomingDelivery } from "../domain/dashboard-lists";
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

  /** Lots with stock expiring from today through `horizonDays`, soonest first. Expired lots are listed by `expiredLots`. */
  upcomingLots(today: CalendarDate, horizonDays: number, take: number) {
    return this.lotsWithStock({ expiryDate: { gte: toDbDate(today), lte: toDbDate(addDays(today, horizonDays)) }, status: { not: "EXPIRED" } }, take);
  }

  /** Lots with stock that are already expired (by date or stored status), oldest expiry first. */
  expiredLots(today: CalendarDate, take: number) {
    return this.lotsWithStock({ OR: [{ expiryDate: { lt: toDbDate(today) } }, { status: "EXPIRED" }] }, take);
  }

  private async lotsWithStock(condition: Prisma.LotWhereInput, take: number) {
    const where: Prisma.LotWhereInput = { AND: [{ currentQuantity: { gt: 0 } }, condition] };
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

  /** Active products with nothing available (first) or at/below their minimum, scarcest first. Same rule as the KPI counts. */
  async lowStockProducts(today: CalendarDate, take: number): Promise<LowStockRow[]> {
    const rows = await this.db.$queryRaw<{ id: string; name: string; available: number; minStock: number }[]>(Prisma.sql`
      WITH levels AS (${productStockLevels(today)})
      SELECT p.id, p.commercial_name AS name, levels.available, levels.min_stock AS "minStock"
      FROM levels JOIN products p ON p.id = levels.id
      WHERE levels.available <= 0 OR levels.available <= levels.min_stock
      ORDER BY (levels.available > 0), levels.available ASC, p.commercial_name ASC
      LIMIT ${take}`);
    return rows;
  }

  /** The next open (scheduled or confirmed) supplier visits, oldest first so late ones lead. */
  async upcomingDeliveries(take: number): Promise<UpcomingDelivery[]> {
    const rows = await this.db.scheduledDelivery.findMany({
      where: { status: { in: [...OPEN] } },
      orderBy: [{ scheduledAt: "asc" }, { id: "asc" }],
      take,
      select: { id: true, scheduledAt: true, status: true, type: true, supplier: { select: { name: true } } },
    });
    return rows.map((row) => ({ id: row.id, supplierName: row.supplier.name, scheduledAt: row.scheduledAt, status: row.status, type: row.type }));
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
