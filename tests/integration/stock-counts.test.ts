/**
 * Physical count integration tests (real database). Same approach as inventory.test.ts: everything
 * runs in one transaction that is rolled back; only the double-close race commits (see its comment).
 */
import { afterAll, describe, expect, it } from "vitest";
import type { AuthUser } from "@/modules/auth/domain/permissions";
import { buildCatalogModule } from "@/modules/catalog/composition";
import type { ProductInput } from "@/modules/catalog/application/product-input";
import type { MovementCommand } from "@/modules/inventory/application/movement-input";
import { buildInventoryModule } from "@/modules/inventory/composition";
import { effectiveLotStatus } from "@/modules/inventory/domain/lot";
import { addDays, fromDbDate, todayInTz, toDbDate } from "@/shared/domain/dates";
import { ConflictError, ForbiddenError, ValidationError } from "@/shared/domain/errors";
import { prisma } from "@/shared/infrastructure/db/prisma";
import type { DbClient } from "@/shared/infrastructure/db/types";
import { createActiveUser, getTestActor, inRolledBackTransaction, seededCategoryAndUnit } from "./support/fixtures";

const TODAY = todayInTz();
const committedCounts: string[] = [];

afterAll(async () => {
  // Counts and their lines can be deleted; the lots, movements and products of the race test cannot.
  await prisma.stockCount.deleteMany({ where: { id: { in: committedCounts } } });
  await prisma.$disconnect();
});

const record = async () => {};

function productInput(categoryId: string, unitId: string, name: string): ProductInput {
  return {
    code: `TEST-${crypto.randomUUID()}`,
    commercialName: name,
    activeIngredient: null,
    brand: null,
    laboratory: null,
    barcode: null,
    sku: null,
    categoryId,
    presentation: null,
    concentration: null,
    pharmaceuticalForm: null,
    contentPerPackage: null,
    unitId,
    minStock: 0,
    maxStock: null,
    costPrice: "0.00",
    salePrice: null,
    usualSupplierId: null,
    location: null,
    status: "ACTIVE",
    notes: null,
  };
}

const entry = (productId: string, lotNumber: string, expiryDate: string, quantity: number, location: string | null = null): MovementCommand => ({
  type: "ENTRY",
  productId,
  quantity,
  lotNumber,
  expiryDate,
  unitCost: null,
  supplierId: null,
  invoiceNumber: null,
  location,
  notes: null,
  reasonId: null,
  reasonText: null,
});

async function adjustmentReason(tx: DbClient) {
  return tx.adjustmentReason.findFirstOrThrow({ where: { kind: "ADJUSTMENT", active: true } });
}

/** A private category with one product, so a count scoped to it only sees this test's lots. */
async function setup(tx: DbClient) {
  const admin = await createActiveUser(tx, "admin");
  const inventory = buildInventoryModule({ db: tx, transact: (work) => work(tx), audit: record, alerts: { evaluate: async () => {} } });
  const catalog = buildCatalogModule({ db: tx, audit: record });
  const category = await tx.category.create({ data: { name: `TEST-${crypto.randomUUID()}` } });
  const { unitId } = await seededCategoryAndUnit(tx);
  const product = await catalog.catalogService.createProduct(admin, productInput(category.id, unitId, "TEST conteo"));
  const enter = async (lotNumber: string, expiry: string, quantity: number) =>
    (await inventory.stockOperations.registerMovement(admin, entry(product.id, lotNumber, expiry, quantity))).movements[0].lotId;
  return { admin, inventory, product, category, enter };
}

describe("physical count: open, count, close", () => {
  it("reconciles shortage, surplus and match with compensating movements and keeps expired lots expired", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { admin, inventory, product, category, enter } = await setup(tx);
      const short = await enter("L-SHORT", addDays(TODAY, 100), 10);
      const over = await enter("L-OVER", addDays(TODAY, 200), 5);
      const same = await enter("L-SAME", addDays(TODAY, 300), 4);
      const skipped = await enter("L-SKIP", addDays(TODAY, 400), 6);
      const expired = await tx.lot.create({
        data: { productId: product.id, lotNumber: "L-OLD", expiryDate: toDbDate(addDays(TODAY, -5)), initialQuantity: 8, currentQuantity: 8 },
      });

      const { id: countId, lines } = await inventory.stockCounts.openCount(admin, { categoryId: category.id });
      expect(lines).toBe(5);
      const snapshot = await tx.stockCountLine.findMany({ where: { stockCountId: countId } });
      expect(snapshot.map((l) => l.expectedQuantity).sort((a, b) => a - b)).toEqual([4, 5, 6, 8, 10]);

      const saved = await inventory.stockCounts.saveCounts(admin, countId, [
        { lotId: short, countedQuantity: 7 },
        { lotId: over, countedQuantity: 9 },
        { lotId: same, countedQuantity: 4 },
        { lotId: expired.id, countedQuantity: 5 },
      ]);
      expect(saved.saved).toBe(4);
      expect((await tx.stockCountLine.findFirstOrThrow({ where: { stockCountId: countId, lotId: short } })).difference).toBe(-3);

      const reason = await adjustmentReason(tx);
      const result = await inventory.stockCounts.closeCount(admin, countId, { reasonId: reason.id, reasonText: "Inventario anual" });
      expect(result).toMatchObject({ corrected: 3, unchanged: 1, uncounted: 1, unitsAdded: 4, unitsRemoved: 6 });

      const lot = (id: string) => tx.lot.findUniqueOrThrow({ where: { id } });
      expect((await lot(short)).currentQuantity).toBe(7);
      expect((await lot(over)).currentQuantity).toBe(9);
      expect((await lot(same)).currentQuantity).toBe(4);
      expect((await lot(skipped)).currentQuantity).toBe(6); // uncounted: untouched
      const expiredAfter = await lot(expired.id);
      expect(expiredAfter.currentQuantity).toBe(5);
      expect(effectiveLotStatus({ expiryDate: fromDbDate(expiredAfter.expiryDate), status: expiredAfter.status }, TODAY)).toBe("EXPIRED");

      const movements = await tx.stockMovement.findMany({ where: { referenceType: "stock_count", referenceId: countId } });
      const describeMovement = (m: (typeof movements)[number]) => `${m.type}:${m.quantity}->${m.balanceAfter}`;
      expect(movements.map(describeMovement).sort()).toEqual(["COUNT_CORRECTION_IN:4->9", "COUNT_CORRECTION_OUT:3->5", "COUNT_CORRECTION_OUT:3->7"]);
      expect(movements.every((m) => m.reasonId === reason.id && m.reasonText === "Inventario anual" && m.userId === admin.id)).toBe(true);

      const closed = await tx.stockCount.findUniqueOrThrow({ where: { id: countId }, include: { lines: true } });
      expect(closed.status).toBe("CLOSED");
      expect(closed.closedAt).not.toBeNull();
      expect(closed.lines.filter((l) => l.reconciled)).toHaveLength(4);
      expect(closed.lines.find((l) => l.lotId === skipped)).toMatchObject({ reconciled: false, countedQuantity: null });
    });
  });

  it("cannot be closed twice and a closed count is read-only", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { admin, inventory, category, enter } = await setup(tx);
      const lot = await enter("L-1", addDays(TODAY, 100), 10);
      const { id: countId } = await inventory.stockCounts.openCount(admin, { categoryId: category.id });
      await inventory.stockCounts.saveCounts(admin, countId, [{ lotId: lot, countedQuantity: 6 }]);
      const reason = { reasonId: null, reasonText: "Conteo de control" };

      await inventory.stockCounts.closeCount(admin, countId, reason);
      await expect(inventory.stockCounts.closeCount(admin, countId, reason)).rejects.toBeInstanceOf(ConflictError);
      await expect(inventory.stockCounts.saveCounts(admin, countId, [{ lotId: lot, countedQuantity: 1 }])).rejects.toBeInstanceOf(ConflictError);

      expect(await tx.stockMovement.count({ where: { referenceType: "stock_count", referenceId: countId } })).toBe(1);
      expect((await tx.lot.findUniqueOrThrow({ where: { id: lot } })).currentQuantity).toBe(6);
    });
  });

  it("requires a valid reason to close", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { admin, inventory, category, enter } = await setup(tx);
      const lot = await enter("L-1", addDays(TODAY, 100), 3);
      const { id: countId } = await inventory.stockCounts.openCount(admin, { categoryId: category.id });
      await inventory.stockCounts.saveCounts(admin, countId, [{ lotId: lot, countedQuantity: 2 }]);

      await expect(inventory.stockCounts.closeCount(admin, countId, { reasonId: null, reasonText: "  " })).rejects.toBeInstanceOf(ValidationError);
      const writeOffReason = await tx.adjustmentReason.findFirstOrThrow({ where: { kind: "WRITE_OFF", active: true } });
      await expect(inventory.stockCounts.closeCount(admin, countId, { reasonId: writeOffReason.id, reasonText: null })).rejects.toBeInstanceOf(
        ValidationError,
      );
      expect((await tx.stockCount.findUniqueOrThrow({ where: { id: countId } })).status).toBe("OPEN");
    });
  });

  it("corrects against the current quantity, so movements made while the count was open are not counted twice", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { admin, inventory, product, category, enter } = await setup(tx);
      const lot = await enter("L-1", addDays(TODAY, 100), 10);
      const { id: countId } = await inventory.stockCounts.openCount(admin, { categoryId: category.id });

      // 3 units are dispensed after the snapshot; the shelf then really holds 7.
      await inventory.stockOperations.registerMovement(admin, { type: "EXIT", productId: product.id, quantity: 3, lotId: null, reasonId: null, reasonText: null });
      await inventory.stockCounts.saveCounts(admin, countId, [{ lotId: lot, countedQuantity: 7 }]);
      const result = await inventory.stockCounts.closeCount(admin, countId, { reasonId: null, reasonText: "Control" });

      expect(result).toMatchObject({ corrected: 0, unchanged: 1 });
      expect((await tx.lot.findUniqueOrThrow({ where: { id: lot } })).currentQuantity).toBe(7);
      expect(await tx.stockMovement.count({ where: { referenceId: countId } })).toBe(0);
    });
  });

  it("rejects an empty scope, counts for lots outside the count and requires permissions", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { admin, inventory, category, enter } = await setup(tx);
      const lot = await enter("L-1", addDays(TODAY, 100), 3);
      const emptyCategory = await tx.category.create({ data: { name: `TEST-${crypto.randomUUID()}` } });
      await expect(inventory.stockCounts.openCount(admin, { categoryId: emptyCategory.id })).rejects.toBeInstanceOf(ValidationError);

      const { id: countId } = await inventory.stockCounts.openCount(admin, { categoryId: category.id });
      await expect(inventory.stockCounts.saveCounts(admin, countId, [{ lotId: crypto.randomUUID(), countedQuantity: 1 }])).rejects.toBeInstanceOf(
        ValidationError,
      );

      const noPermissions: AuthUser = { ...admin, roleName: "employee", permissions: [] };
      const countOnly: AuthUser = { ...admin, roleName: "employee", permissions: ["inventory.count"] };
      const reason = { reasonId: null, reasonText: "x" };
      await expect(inventory.stockCounts.openCount(noPermissions, {})).rejects.toBeInstanceOf(ForbiddenError);
      await expect(inventory.stockCounts.saveCounts(noPermissions, countId, [])).rejects.toBeInstanceOf(ForbiddenError);
      await expect(inventory.stockCounts.closeCount(noPermissions, countId, reason)).rejects.toBeInstanceOf(ForbiddenError);
      // Reconciliation adjusts stock: counting alone is not enough to close.
      await expect(inventory.stockCounts.closeCount(countOnly, countId, reason)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(inventory.stockCounts.saveCounts(countOnly, countId, [{ lotId: lot, countedQuantity: 3 }])).resolves.toMatchObject({ saved: 1 });
    });
  });
});

describe("double close race (real transactions)", () => {
  it("two concurrent closes: exactly one applies the corrections", async () => {
    const actor = await getTestActor("admin");
    const inventory = buildInventoryModule({ alerts: { evaluate: async () => {} }, audit: record });
    // Scope the count by a unique lot location (not a new category): no residue in the category list.
    const location = `TEST-${crypto.randomUUID()}`;
    const { categoryId, unitId } = await seededCategoryAndUnit();
    const product = await prisma.product.create({
      data: { code: location, commercialName: "TEST conteo concurrente", categoryId, unitId },
    });
    const { movements } = await inventory.stockOperations.registerMovement(actor, entry(product.id, "L-RACE", addDays(TODAY, 90), 10, location));
    const lotId = movements[0].lotId;

    const { id: countId } = await inventory.stockCounts.openCount(actor, { location });
    committedCounts.push(countId);
    await inventory.stockCounts.saveCounts(actor, countId, [{ lotId, countedQuantity: 6 }]);

    const reason = { reasonId: null, reasonText: "Carrera de cierre" };
    const results = await Promise.allSettled([
      inventory.stockCounts.closeCount(actor, countId, reason),
      inventory.stockCounts.closeCount(actor, countId, reason),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError);
    expect((await prisma.lot.findUniqueOrThrow({ where: { id: lotId } })).currentQuantity).toBe(6);
    expect(await prisma.stockMovement.count({ where: { referenceType: "stock_count", referenceId: countId } })).toBe(1);
  });
});
