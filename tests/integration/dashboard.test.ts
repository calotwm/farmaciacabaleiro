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

describe("dashboard expiring lots", () => {
  it("separates expired lots from the upcoming window, with stock only, soonest first, and counts them", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { categoryId, unitId } = await seededCategoryAndUnit(tx);
      const reads = new PrismaDashboardReads(tx);
      const beforeUpcoming = await reads.upcomingLots(TODAY, 30, 1);
      const beforeExpired = await reads.expiredLots(TODAY, 1);

      const product = await tx.product.create({ data: { code: `TEST-${crypto.randomUUID()}`, commercialName: "TEST hero", categoryId, unitId } });
      const lot = (expiry: string, quantity: number) =>
        tx.lot.create({
          data: { productId: product.id, lotNumber: `L-${crypto.randomUUID()}`, expiryDate: toDbDate(expiry), initialQuantity: quantity, currentQuantity: quantity },
        });
      const ancient = await lot(addDays(TODAY, -4000), 2); // expired, sorts before any real lot
      const older = await lot(addDays(TODAY, -3999), 1);
      const today = await lot(TODAY, 3); // valid through today: upcoming, not expired
      const soon = await lot(addDays(TODAY, 29), 5);
      await lot(addDays(TODAY, 31), 5); // outside the 30-day horizon
      await lot(addDays(TODAY, -4001), 0); // no stock: ignored

      const expired = await reads.expiredLots(TODAY, 2);
      expect(expired.total - beforeExpired.total).toBe(2);
      expect(expired.rows.map((row) => row.id)).toEqual([ancient.id, older.id]);
      expect(expired.rows[0]).toMatchObject({ quantity: 2, expiryDate: addDays(TODAY, -4000), product: { id: product.id } });

      const upcoming = await reads.upcomingLots(TODAY, 30, 10_000);
      expect(upcoming.total - beforeUpcoming.total).toBe(2);
      const ids = upcoming.rows.map((row) => row.id);
      expect(ids).not.toContain(ancient.id);
      expect(ids.indexOf(today.id)).toBeLessThan(ids.indexOf(soon.id));
    });
  });
});

describe("dashboard low stock list and upcoming deliveries", () => {
  it("lists out-of-stock products before low ones and agrees with the KPI counts", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { categoryId, unitId } = await seededCategoryAndUnit(tx);
      const reads = new PrismaDashboardReads(tx);
      const product = (name: string, minStock: number) =>
        tx.product.create({ data: { code: `TEST-${crypto.randomUUID()}`, commercialName: name, categoryId, unitId, minStock } });
      const low = await product("TEST list low", 5);
      await tx.lot.create({ data: { productId: low.id, lotNumber: `L-${crypto.randomUUID()}`, expiryDate: toDbDate(addDays(TODAY, 200)), initialQuantity: 3, currentQuantity: 3 } });
      const out = await product("TEST list out", 5);
      const fine = await product("TEST list fine", 1);
      await tx.lot.create({ data: { productId: fine.id, lotNumber: `L-${crypto.randomUUID()}`, expiryDate: toDbDate(addDays(TODAY, 200)), initialQuantity: 9, currentQuantity: 9 } });

      const kpis = await reads.stockKpis(TODAY, [30]);
      const rows = await reads.lowStockProducts(TODAY, 10_000);
      expect(rows.length).toBe(kpis.lowStock + kpis.outOfStock);
      const ids = rows.map((row) => row.id);
      expect(ids).toContain(low.id);
      expect(ids).toContain(out.id);
      expect(ids).not.toContain(fine.id);
      expect(ids.indexOf(out.id)).toBeLessThan(ids.indexOf(low.id));
      expect(rows.find((row) => row.id === low.id)).toMatchObject({ available: 3, minStock: 5, name: "TEST list low" });
    });
  });

  it("returns open deliveries oldest first with the supplier name and skips closed ones", async () => {
    await inRolledBackTransaction(async (tx) => {
      const reads = new PrismaDashboardReads(tx);
      const supplier = await tx.supplier.create({ data: { name: `TEST proveedor ${crypto.randomUUID()}` } });
      const at = (days: number) => new Date(Date.now() + days * 86_400_000);
      const make = (days: number, status: "SCHEDULED" | "CONFIRMED" | "CANCELLED") =>
        tx.scheduledDelivery.create({ data: { supplierId: supplier.id, scheduledAt: at(days), status, type: "DELIVERY" } });
      const ancient = await make(-4000, "SCHEDULED");
      const later = await make(-3999, "CONFIRMED");
      await make(-3998, "CANCELLED");

      const rows = await reads.upcomingDeliveries(2);
      expect(rows.map((row) => row.id)).toEqual([ancient.id, later.id]);
      expect(rows[0]).toMatchObject({ supplierName: supplier.name, status: "SCHEDULED", type: "DELIVERY" });
    });
  });
});
