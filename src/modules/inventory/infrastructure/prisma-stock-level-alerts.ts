import { ADMIN_ROLE } from "@/modules/auth/domain/permissions";
import { type CalendarDate, toDbDate } from "@/shared/domain/dates";
import type { DbClient } from "@/shared/infrastructure/db/types";
import type { StockLevelAlerts } from "../application/ports";
import { evaluateStockLevel } from "../domain/low-stock";
import { computeStockBreakdown } from "../domain/stock-breakdown";
import { toLotState } from "./prisma-stock-tx";

/**
 * Low/out-of-stock alerts for a product, idempotent per product, rule and day:
 * the AlertEvent unique key and the (user, alert) unique key make a repeated evaluation create nothing.
 * Notifications go to active users that can read inventory (admins and roles with `inventory.read`).
 */
export class PrismaStockLevelAlerts implements StockLevelAlerts {
  constructor(private readonly db: DbClient) {}

  async evaluate(productId: string, today: CalendarDate): Promise<void> {
    const product = await this.db.product.findUnique({
      where: { id: productId },
      select: { id: true, commercialName: true, minStock: true, status: true },
    });
    if (!product || product.status === "ARCHIVED") return;

    const lots = (await this.db.lot.findMany({ where: { productId } })).map(toLotState);
    const { available } = computeStockBreakdown(lots, today);
    const rule = evaluateStockLevel(available, product.minStock);
    if (!rule) return;

    const key = { rule, entityType: "product", entityId: productId, thresholdKey: "", eventDate: toDbDate(today) };
    await this.db.alertEvent.createMany({
      data: [{ ...key, payload: { productId, productName: product.commercialName, available, minStock: product.minStock } }],
      skipDuplicates: true,
    });
    const event = await this.db.alertEvent.findUniqueOrThrow({
      where: { rule_entityType_entityId_thresholdKey_eventDate: key },
      select: { id: true },
    });

    const recipients = await this.db.user.findMany({
      where: {
        active: true,
        OR: [{ role: { name: ADMIN_ROLE } }, { role: { permissions: { some: { permission: { key: "inventory.read" } } } } }],
      },
      select: { id: true },
    });
    const out = rule === "OUT_OF_STOCK";
    await this.db.notification.createMany({
      data: recipients.map((user) => ({
        userId: user.id,
        alertEventId: event.id,
        title: out ? `Sin stock: ${product.commercialName}` : `Stock bajo: ${product.commercialName}`,
        body: out
          ? "No quedan unidades disponibles."
          : `Quedan ${available} ${available === 1 ? "unidad disponible" : "unidades disponibles"} (mínimo ${product.minStock}).`,
        priority: out ? ("HIGH" as const) : ("MEDIUM" as const),
        link: `/productos/${productId}`,
      })),
      skipDuplicates: true,
    });
  }
}
