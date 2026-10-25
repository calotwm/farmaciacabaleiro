import "dotenv/config";
/** Dashboard SQL (stock levels and KPIs) against the real database, inside a rolled-back transaction. */
import { afterAll, describe, expect, it } from "vitest";
import { PrismaDashboardReads } from "@/modules/dashboard/infrastructure/prisma-dashboard-reads";
import { addDays, todayInTz, toDbDate } from "@/shared/domain/dates";
import { prisma } from "@/shared/infrastructure/db/prisma";
import { productIdsAtStockLevel } from "@/shared/infrastructure/db/stock-level-sql";
import { inRolledBackTransaction, seededCategoryAndUnit } from "./support/fixtures";

const TODAY = todayInTz();

afterAll(async () => {
  await prisma.$disconnect();
});

describe("dashboard stock levels", () => {
  it("classifies products like computeStockBreakdown and counts the KPIs", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { categoryId, unitId } = await seededCategoryAndUnit(tx);
      const reads = new PrismaDashboardReads(tx);
      const before = await reads.stockKpis(TODAY, [30, 90]);

      const product = (name: string, minStock: number) =>
        tx.product.create({ data: { code: `TEST-${crypto.randomUUID()}`, commercialName: name, categoryId, unitId, minStock } });
      const lot = (productId: string, expiry: string, quantity: number, extra: { status?: "BLOCKED" | "AVAILABLE"; blockedQuantity?: number } = {}) =>
        tx.lot.create({
          data: { productId, lotNumber: `L-${crypto.randomUUID()}`, expiryDate: toDbDate(expiry), initialQuantity: quantity, currentQuantity: quantity, ...extra },
        });

      const low = await product("TEST low", 5);
      await lot(low.id, addDays(TODAY, 20), 4); // available 4 <= 5
      await lot(low.id, addDays(TODAY, -2), 50); // expired: not available
      const out = await product("TEST out", 5);
      await lot(out.id, addDays(TODAY, 200), 10, { status: "BLOCKED" }); // blocked lot: not available
      const fine = await product("TEST fine", 5);
      await lot(fine.id, addDays(TODAY, 200), 10, { blockedQuantity: 2 }); // available 8

      const lowIds = await productIdsAtStockLevel(tx, "low", TODAY);
      const outIds = await productIdsAtStockLevel(tx, "out", TODAY);
      expect(lowIds).toContain(low.id);
      expect(lowIds).not.toContain(out.id);
      expect(outIds).toContain(out.id);
      expect([...lowIds, ...outIds]).not.toContain(fine.id);

      const after = await reads.stockKpis(TODAY, [30, 90]);
      expect(after.activeProducts - before.activeProducts).toBe(3);
      expect(after.lowStock - before.lowStock).toBe(1);
      expect(after.outOfStock - before.outOfStock).toBe(1);
      expect(after.expiredWithStock - before.expiredWithStock).toBe(1);
      expect(after.expiring[0]?.count).toBe((before.expiring[0]?.count ?? 0) + 1); // the 20-day lot
      expect(after.totalUnits - before.totalUnits).toBe(4 + 50 + 10 + 10);
    });
  });
});
