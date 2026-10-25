/**
 * Inventory integration tests against the real (shared) database.
 *
 * stock_movements is append-only, so rows that ever had a movement cannot be deleted. Therefore:
 * - everything that can run inside one transaction does, and the transaction is ROLLED BACK
 *   (`inRolledBackTransaction`): the services receive the outer transaction client as both their
 *   reader and their transaction runner, so nothing is committed and nothing is left behind;
 * - the concurrency tests need real, separate transactions, so they commit. They use one product
 *   with a unique `TEST-<uuid>` code and the permanent inactive test actor, with alerts disabled so
 *   no notification reaches real users. Those few rows are the only residue.
 */
import { afterAll, describe, expect, it } from "vitest";
import type { AuthUser } from "@/modules/auth/domain/permissions";
import { buildCatalogModule } from "@/modules/catalog/composition";
import type { ProductInput } from "@/modules/catalog/application/product-input";
import type { AuditEntry } from "@/modules/audit";
import type { MovementCommand } from "@/modules/inventory/application/movement-input";
import { buildInventoryModule } from "@/modules/inventory/composition";
import { ExpiredLotError, InsufficientStockError } from "@/modules/inventory/domain/errors";
import { addDays, todayInTz, toDbDate } from "@/shared/domain/dates";
import { ForbiddenError, ValidationError } from "@/shared/domain/errors";
import { prisma } from "@/shared/infrastructure/db/prisma";
import type { DbClient } from "@/shared/infrastructure/db/types";
import { createActiveUser, getTestActor, inRolledBackTransaction, seededCategoryAndUnit } from "./support/fixtures";

const TODAY = todayInTz();
const YESTERDAY = addDays(TODAY, -1);

afterAll(async () => {
  await prisma.$disconnect();
});

/** Builds the modules on top of an outer transaction that the caller always rolls back. */
function modulesOn(tx: DbClient, overrides: { onAlertError?: (e: unknown) => void } = {}) {
  const audit: AuditEntry[] = [];
  const record = async (entry: AuditEntry) => {
    audit.push(entry);
  };
  const inventory = buildInventoryModule({ db: tx, transact: (work) => work(tx), audit: record, ...overrides });
  const catalog = buildCatalogModule({ db: tx, audit: record });
  return { ...inventory, catalog, audit };
}

function productInput(categoryId: string, unitId: string, overrides: Partial<ProductInput> = {}): ProductInput {
  return {
    code: `TEST-${crypto.randomUUID()}`,
    commercialName: "TEST Ibuprofeno 400",
    activeIngredient: "Ibuprofeno",
    brand: null,
    laboratory: null,
    barcode: null,
    sku: null,
    categoryId,
    presentation: null,
    concentration: "400 mg",
    pharmaceuticalForm: "Comprimido",
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
    ...overrides,
  };
}

const entry = (productId: string, lotNumber: string, expiryDate: string, quantity: number): MovementCommand => ({
  type: "ENTRY",
  productId,
  quantity,
  lotNumber,
  expiryDate,
  unitCost: "100.00",
  supplierId: null,
  invoiceNumber: null,
  location: null,
  notes: null,
  reasonId: null,
  reasonText: null,
});

const exit = (productId: string, quantity: number, lotId: string | null = null): MovementCommand => ({
  type: "EXIT",
  productId,
  quantity,
  lotId,
  reasonId: null,
  reasonText: null,
});

async function reasonOf(tx: DbClient, kind: "ADJUSTMENT" | "WRITE_OFF" | "RETURN") {
  return tx.adjustmentReason.findFirstOrThrow({ where: { kind, active: true } });
}

/** An already expired lot: it cannot be created through ENTRY, so insert it directly. */
async function insertExpiredLot(tx: DbClient, productId: string, quantity: number) {
  return tx.lot.create({
    data: {
      productId,
      lotNumber: "VENCIDO-1",
      expiryDate: toDbDate(YESTERDAY),
      initialQuantity: quantity,
      currentQuantity: quantity,
    },
  });
}

async function setup(tx: DbClient, productOverrides: Partial<ProductInput> = {}) {
  const [admin, employee] = [await createActiveUser(tx, "admin"), await createActiveUser(tx, "employee")];
  const modules = modulesOn(tx);
  const { categoryId, unitId } = await seededCategoryAndUnit(tx);
  const product = await modules.catalog.catalogService.createProduct(admin, productInput(categoryId, unitId, productOverrides));
  return { ...modules, admin, employee, product };
}

describe("spec #1: product with two lots of different expiry", () => {
  it("creates both lots through entries, derives stock from them and marks the earliest expiry to use first", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { stockOperations, stockQueries, admin, product } = await setup(tx);

      const late = await stockOperations.registerMovement(admin, entry(product.id, "L-LATE", addDays(TODAY, 400), 20));
      const early = await stockOperations.registerMovement(admin, entry(product.id, "L-EARLY", addDays(TODAY, 100), 8));
      expect(late.movements[0]).toMatchObject({ type: "ENTRY", quantity: 20, balanceAfter: 20 });

      const stock = await stockQueries.getProductStock(admin, product.id);
      expect(stock.breakdown).toEqual({ physical: 28, blocked: 0, expired: 0, available: 28 });
      expect(stock.lots.map((lot) => lot.lotNumber)).toEqual(["L-EARLY", "L-LATE"]);
      expect(stock.firstUsableLotId).toBe(early.movements[0].lotId);
    });
  });

  it("adds to the existing lot when number and expiry match, and rejects an already expired new lot", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { stockOperations, stockQueries, admin, product } = await setup(tx);
      const expiry = addDays(TODAY, 60);

      await stockOperations.registerMovement(admin, entry(product.id, "L-1", expiry, 5));
      const again = await stockOperations.registerMovement(admin, entry(product.id, "L-1", expiry, 7));
      expect(again.movements[0].balanceAfter).toBe(12);
      expect((await stockQueries.getProductStock(admin, product.id)).lots).toHaveLength(1);

      await expect(stockOperations.registerMovement(admin, entry(product.id, "L-OLD", YESTERDAY, 3))).rejects.toBeInstanceOf(ValidationError);
    });
  });
});

describe("spec #3: expired lots", () => {
  it("rejects a normal exit from an expired lot but accepts a write-off with a reason", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { stockOperations, admin, product } = await setup(tx);
      const lot = await insertExpiredLot(tx, product.id, 6);

      // Specific lot: explicit expired error. FEFO: nothing usable, so insufficient stock (0 available).
      await expect(stockOperations.registerMovement(admin, exit(product.id, 1, lot.id))).rejects.toBeInstanceOf(ExpiredLotError);
      await expect(stockOperations.registerMovement(admin, exit(product.id, 1))).rejects.toMatchObject({ available: 0 });

      const writeOff = (reasonText: string | null, reasonId: string | null = null): MovementCommand => ({
        type: "WRITE_OFF",
        productId: product.id,
        lotId: lot.id,
        quantity: 6,
        reasonId,
        reasonText,
      });
      // The reason is mandatory.
      await expect(stockOperations.registerMovement(admin, writeOff(null))).rejects.toBeInstanceOf(ValidationError);

      const reason = await reasonOf(tx, "WRITE_OFF");
      const result = await stockOperations.registerMovement(admin, writeOff("Vencido en góndola", reason.id));
      expect(result.movements[0]).toMatchObject({ type: "WRITE_OFF", quantity: 6, balanceAfter: 0 });
      expect(await tx.lot.findUniqueOrThrow({ where: { id: lot.id } })).toMatchObject({ currentQuantity: 0, status: "DEPLETED" });
    });
  });

  it("a return to the supplier is also accepted on an expired lot, but adjustments are not", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { stockOperations, admin, product } = await setup(tx);
      const lot = await insertExpiredLot(tx, product.id, 4);

      const base = { productId: product.id, lotId: lot.id, quantity: 1, reasonId: null, reasonText: "Devolución acordada" } as const;
      await expect(stockOperations.registerMovement(admin, { type: "ADJUSTMENT_OUT", ...base })).rejects.toBeInstanceOf(ExpiredLotError);
      await expect(stockOperations.registerMovement(admin, { type: "RETURN", ...base })).resolves.toBeDefined();
    });
  });

  it("only users with the write-off permission can write off or return", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { stockOperations, employee, product } = await setup(tx);
      const lot = await insertExpiredLot(tx, product.id, 4);
      const command: MovementCommand = { type: "WRITE_OFF", productId: product.id, lotId: lot.id, quantity: 1, reasonId: null, reasonText: "x" };
      await expect(stockOperations.registerMovement(employee, command)).rejects.toBeInstanceOf(ForbiddenError);
    });
  });
});

describe("spec #6: a movement updates the lot and the history", () => {
  it("records balance, user, reason and splits a FEFO exit across lots", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { stockOperations, stockQueries, admin, employee, product } = await setup(tx);
      await stockOperations.registerMovement(employee, entry(product.id, "L-B", addDays(TODAY, 300), 10));
      await stockOperations.registerMovement(employee, entry(product.id, "L-A", addDays(TODAY, 90), 3));

      const result = await stockOperations.registerMovement(employee, { ...exit(product.id, 5), reasonText: "Venta mostrador" });
      expect(result.movements.map((m) => [m.quantity, m.balanceAfter])).toEqual([
        [3, 0],
        [2, 8],
      ]);

      const lots = await tx.lot.findMany({ where: { productId: product.id }, orderBy: { lotNumber: "asc" } });
      expect(lots.map((l) => [l.lotNumber, l.currentQuantity, l.status])).toEqual([
        ["L-A", 0, "DEPLETED"],
        ["L-B", 8, "AVAILABLE"],
      ]);

      const history = await stockQueries.listMovements(admin, { productId: product.id, type: "EXIT", page: 1, pageSize: 10 });
      expect(history.total).toBe(2);
      expect(history.items.every((m) => m.userName === employee.name && m.reasonText === "Venta mostrador")).toBe(true);
      expect(history.items.map((m) => m.balanceAfter).sort()).toEqual([0, 8]);
    });
  });

  it("serves exits from a specific lot when the user picks one, and skips quarantined lots otherwise", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { stockOperations, admin, product } = await setup(tx);
      const first = await stockOperations.registerMovement(admin, entry(product.id, "L-1", addDays(TODAY, 30), 5));
      const second = await stockOperations.registerMovement(admin, entry(product.id, "L-2", addDays(TODAY, 200), 5));
      const reason = await reasonOf(tx, "ADJUSTMENT");

      const specific = await stockOperations.registerMovement(admin, exit(product.id, 2, second.movements[0].lotId));
      expect(specific.movements).toHaveLength(1);
      expect(specific.movements[0]).toMatchObject({ lotId: second.movements[0].lotId, balanceAfter: 3 });

      await stockOperations.registerMovement(admin, {
        type: "BLOCK",
        productId: product.id,
        lotId: first.movements[0].lotId,
        mode: "QUARANTINE",
        quantity: null,
        reasonId: reason.id,
        reasonText: null,
      });
      const afterQuarantine = await stockOperations.registerMovement(admin, exit(product.id, 3));
      expect(afterQuarantine.movements.map((m) => m.lotId)).toEqual([second.movements[0].lotId]);
      await expect(stockOperations.registerMovement(admin, exit(product.id, 1))).rejects.toBeInstanceOf(InsufficientStockError);
    });
  });

  it("audits every operation with the actor", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { stockOperations, admin, product, audit } = await setup(tx);
      await stockOperations.registerMovement(admin, entry(product.id, "L-1", addDays(TODAY, 30), 5));
      await stockOperations.registerMovement(admin, exit(product.id, 2));

      const stock = audit.filter((a) => a.action.startsWith("stock."));
      expect(stock.map((a) => a.action)).toEqual(["stock.entry", "stock.exit"]);
      expect(stock.every((a) => a.actorId === admin.id && a.entityType === "product" && a.entityId === product.id)).toBe(true);
    });
  });
});

describe("negative stock", () => {
  it("rejects an exit above the available stock, states how much is available and changes nothing", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { stockOperations, admin, product } = await setup(tx);
      const { movements } = await stockOperations.registerMovement(admin, entry(product.id, "L-1", addDays(TODAY, 30), 4));

      const attempt = stockOperations.registerMovement(admin, exit(product.id, 5));
      await expect(attempt).rejects.toBeInstanceOf(InsufficientStockError);
      await expect(attempt).rejects.toMatchObject({ available: 4, requested: 5 });

      expect((await tx.lot.findUniqueOrThrow({ where: { id: movements[0].lotId } })).currentQuantity).toBe(4);
      expect(await tx.stockMovement.count({ where: { productId: product.id } })).toBe(1);
    });
  });

  it("never lets blocked units be dispensed", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { stockOperations, stockQueries, admin, product } = await setup(tx);
      const { movements } = await stockOperations.registerMovement(admin, entry(product.id, "L-1", addDays(TODAY, 30), 10));
      const reason = await reasonOf(tx, "ADJUSTMENT");
      await stockOperations.registerMovement(admin, {
        type: "BLOCK",
        productId: product.id,
        lotId: movements[0].lotId,
        mode: "UNITS",
        quantity: 6,
        reasonId: reason.id,
        reasonText: null,
      });

      expect((await stockQueries.getProductStock(admin, product.id)).breakdown).toEqual({ physical: 10, blocked: 6, expired: 0, available: 4 });
      await expect(stockOperations.registerMovement(admin, exit(product.id, 5))).rejects.toMatchObject({ available: 4 });
      await expect(stockOperations.registerMovement(admin, exit(product.id, 4))).resolves.toBeDefined();
    });
  });
});

describe("spec #7: low stock alert", () => {
  it("creates the alert and one notification per recipient once, however often it is evaluated that day", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { stockOperations, stockLevelAlerts, admin, employee, product } = await setup(tx, { minStock: 5 });
      await stockOperations.registerMovement(admin, entry(product.id, "L-1", addDays(TODAY, 90), 10));
      const alertCount = (rule: "LOW_STOCK" | "OUT_OF_STOCK") =>
        tx.alertEvent.count({ where: { rule, entityType: "product", entityId: product.id } });
      expect(await alertCount("LOW_STOCK")).toBe(0);

      await stockOperations.registerMovement(admin, exit(product.id, 6)); // 4 available <= 5
      expect(await alertCount("LOW_STOCK")).toBe(1);
      const event = await tx.alertEvent.findFirstOrThrow({ where: { rule: "LOW_STOCK", entityId: product.id } });
      expect(event.eventDate.toISOString().slice(0, 10)).toBe(TODAY);

      const notificationsFor = (user: AuthUser) => tx.notification.count({ where: { userId: user.id, alertEventId: event.id } });
      expect(await notificationsFor(employee)).toBe(1);
      expect(await notificationsFor(admin)).toBe(1);

      // Same day, evaluated again (directly and through another movement): nothing is duplicated.
      await stockLevelAlerts.evaluate(product.id, TODAY);
      await stockOperations.registerMovement(admin, exit(product.id, 1));
      expect(await alertCount("LOW_STOCK")).toBe(1);
      expect(await notificationsFor(employee)).toBe(1);

      // Running out is its own alert.
      await stockOperations.registerMovement(admin, exit(product.id, 3));
      expect(await alertCount("OUT_OF_STOCK")).toBe(1);
      expect(await alertCount("LOW_STOCK")).toBe(1);
    });
  });

  it("an alert failure after the commit never undoes or fails the movement", async () => {
    await inRolledBackTransaction(async (tx) => {
      const failures: unknown[] = [];
      const record = async () => {};
      const inventory = buildInventoryModule({
        db: tx,
        transact: (work) => work(tx),
        audit: record,
        alerts: {
          evaluate: async () => {
            throw new Error("notification channel down");
          },
        },
        onAlertError: (error) => failures.push(error),
      });
      const admin = await createActiveUser(tx, "admin");
      const { categoryId, unitId } = await seededCategoryAndUnit(tx);
      const product = await buildCatalogModule({ db: tx, audit: record }).catalogService.createProduct(admin, productInput(categoryId, unitId));

      const result = await inventory.stockOperations.registerMovement(admin, entry(product.id, "L-1", addDays(TODAY, 90), 5));
      expect(result.movements).toHaveLength(1);
      expect(failures).toHaveLength(1);
      expect(await tx.stockMovement.count({ where: { productId: product.id } })).toBe(1);
    });
  });
});

describe("permissions", () => {
  it("employees can read and register normal movements; an actor with no inventory permission cannot", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { stockOperations, stockQueries, employee, product } = await setup(tx);
      await expect(stockOperations.registerMovement(employee, entry(product.id, "L-1", addDays(TODAY, 30), 3))).resolves.toBeDefined();
      await expect(stockQueries.getProductStock(employee, product.id)).resolves.toBeDefined();

      const nobody: AuthUser = { ...employee, permissions: [] };
      await expect(stockOperations.registerMovement(nobody, exit(product.id, 1))).rejects.toBeInstanceOf(ForbiddenError);
      await expect(stockQueries.listLots(nobody, { status: "", sort: "expiry", dir: "asc", page: 1, pageSize: 10 })).rejects.toBeInstanceOf(ForbiddenError);
    });
  });
});

describe("lot list", () => {
  it("filters by effective status and expiry period, and sorts by expiry", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { stockOperations, stockQueries, admin, product } = await setup(tx);
      await stockOperations.registerMovement(admin, entry(product.id, "L-SOON", addDays(TODAY, 10), 5));
      await stockOperations.registerMovement(admin, entry(product.id, "L-FAR", addDays(TODAY, 500), 5));
      await insertExpiredLot(tx, product.id, 2);

      const query = { productId: product.id, sort: "expiry" as const, dir: "asc" as const, page: 1, pageSize: 20 };
      const numbers = async (overrides: Record<string, unknown>) =>
        (await stockQueries.listLots(admin, { ...query, status: "", ...overrides })).items.map((lot) => lot.lotNumber);

      expect(await numbers({})).toEqual(["VENCIDO-1", "L-SOON", "L-FAR"]);
      expect(await numbers({ status: "EXPIRED" })).toEqual(["VENCIDO-1"]);
      expect(await numbers({ status: "AVAILABLE" })).toEqual(["L-SOON", "L-FAR"]);
      expect(await numbers({ expiryFrom: TODAY, expiryTo: addDays(TODAY, 30) })).toEqual(["L-SOON"]);
      expect(await numbers({ dir: "desc" })).toEqual(["L-FAR", "L-SOON", "VENCIDO-1"]);
    });
  });
});

describe("concurrency (real transactions)", () => {
  const code = `TEST-${crypto.randomUUID()}`;
  const noAlerts = { evaluate: async () => {} };
  const noAudit = async () => {};
  let productId: string;
  let lotId: string;
  let actor: AuthUser;

  async function prepare(quantity: number) {
    actor = await getTestActor("admin");
    const inventory = buildInventoryModule({ alerts: noAlerts, audit: noAudit });
    const { categoryId, unitId } = await seededCategoryAndUnit();
    const product = await prisma.product.create({
      data: { code: `${code}-${quantity}-${crypto.randomUUID().slice(0, 4)}`, commercialName: "TEST concurrency", categoryId, unitId },
    });
    productId = product.id;
    const { movements } = await inventory.stockOperations.registerMovement(actor, entry(productId, "L-CONC", addDays(TODAY, 90), quantity));
    lotId = movements[0].lotId;
    return inventory;
  }

  it("two concurrent exits never drive the lot negative: exactly one succeeds", async () => {
    const inventory = await prepare(5);
    const results = await Promise.allSettled([
      inventory.stockOperations.registerMovement(actor, exit(productId, 3)),
      inventory.stockOperations.registerMovement(actor, exit(productId, 3)),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected?.reason).toBeInstanceOf(InsufficientStockError);
    expect((await prisma.lot.findUniqueOrThrow({ where: { id: lotId } })).currentQuantity).toBe(2);
    expect(await prisma.stockMovement.count({ where: { productId, type: "EXIT" } })).toBe(1);
  });

  it("many concurrent single-unit exits take exactly the available stock and no more", async () => {
    const inventory = await prepare(4);
    const results = await Promise.allSettled(
      Array.from({ length: 7 }, () => inventory.stockOperations.registerMovement(actor, exit(productId, 1))),
    );

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(4);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(3);
    const lot = await prisma.lot.findUniqueOrThrow({ where: { id: lotId } });
    expect(lot).toMatchObject({ currentQuantity: 0, status: "DEPLETED" });
    const movements = await prisma.stockMovement.findMany({ where: { productId, type: "EXIT" }, orderBy: { occurredAt: "asc" } });
    expect(movements.map((m) => m.balanceAfter).sort()).toEqual([0, 1, 2, 3]);
  });
});
