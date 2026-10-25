import "dotenv/config";
/** Expirations summary against the real database, inside a rolled-back transaction. */
import { afterAll, describe, expect, it } from "vitest";
import { PrismaStockReadRepository } from "@/modules/inventory/infrastructure/prisma-stock-read-repository";
import { addDays, todayInTz, toDbDate } from "@/shared/domain/dates";
import { prisma } from "@/shared/infrastructure/db/prisma";
import { inRolledBackTransaction, seededCategoryAndUnit } from "./support/fixtures";

const TODAY = todayInTz();

afterAll(async () => {
  await prisma.$disconnect();
});

describe("expiration summary", () => {
  it("totals lots and units per expired, window and range, and agrees with the list for the same filters", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { categoryId, unitId } = await seededCategoryAndUnit(tx);
      const reads = new PrismaStockReadRepository(tx);
      // A unique product name isolates the figures from whatever else is in the dev database.
      const tag = `TESTEXP-${crypto.randomUUID()}`;
      const product = await tx.product.create({ data: { code: tag, commercialName: tag, categoryId, unitId } });
      const lot = (expiry: string, quantity: number) =>
        tx.lot.create({
          data: { productId: product.id, lotNumber: `L-${crypto.randomUUID()}`, expiryDate: toDbDate(expiry), initialQuantity: quantity, currentQuantity: quantity },
        });
      await lot(addDays(TODAY, -3), 4); // expired with stock
      await lot(addDays(TODAY, -9), 0); // expired, no stock: ignored
      await lot(TODAY, 2); // expires today: still valid, inside every window
      await lot(addDays(TODAY, 6), 5);
      await lot(addDays(TODAY, 20), 10);
      await lot(addDays(TODAY, 80), 20);
      await lot(addDays(TODAY, 400), 99); // outside every window and range

      const ranges = [
        { key: "soon", from: TODAY, to: addDays(TODAY, 10) },
        { key: "later", from: addDays(TODAY, 11), to: addDays(TODAY, 100) },
      ];
      const summary = await reads.expirationSummary({ today: TODAY, windows: [7, 30, 90], ranges, search: tag });

      expect(summary.expired).toEqual({ lots: 1, units: 4 });
      expect(summary.windows).toEqual([
        { days: 7, lots: 2, units: 7 },
        { days: 30, lots: 3, units: 17 },
        { days: 90, lots: 4, units: 37 },
      ]);
      expect(summary.ranges).toEqual([
        { key: "soon", lots: 2, units: 7 },
        { key: "later", lots: 2, units: 30 },
      ]);

      const list = await reads.listLots({
        search: tag, status: "", expiryFrom: TODAY, expiryTo: addDays(TODAY, 30), withStock: true, sort: "expiry", dir: "asc", page: 1, pageSize: 50, today: TODAY,
      });
      expect(list.total).toBe(summary.windows[1]?.lots);
      expect(list.items.reduce((sum, item) => sum + item.currentQuantity, 0)).toBe(summary.windows[1]?.units);

      const other = await reads.expirationSummary({ today: TODAY, windows: [7], ranges: [], search: tag, supplierId: crypto.randomUUID() });
      expect(other.windows[0]).toEqual({ days: 7, lots: 0, units: 0 });
    });
  });
});
