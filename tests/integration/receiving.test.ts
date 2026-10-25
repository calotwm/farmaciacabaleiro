/**
 * Goods receiving integration tests (real database). Everything runs inside one transaction that is rolled back;
 * only the concurrent double-confirm commits (see its comment) and removes what it can afterwards.
 */
import { afterAll, describe, expect, it } from "vitest";
import type { AuthUser } from "@/modules/auth/domain/permissions";
import { buildDeliveriesModule } from "@/modules/deliveries/composition";
import { buildReceivingModule } from "@/modules/receiving/composition";
import type { ReceiptContent } from "@/modules/receiving/application/ports";
import { receiptContentSchema } from "@/modules/receiving/application/receipt-input";
import type { ReceiptLine } from "@/modules/receiving/domain/receipt";
import { PrismaReceiptAlerts } from "@/modules/receiving/infrastructure/prisma-receipt-alerts";
import { addDays, todayInTz, toDbDate, zonedInstant } from "@/shared/domain/dates";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/shared/domain/errors";
import { prisma } from "@/shared/infrastructure/db/prisma";
import type { DbClient } from "@/shared/infrastructure/db/types";
import { createActiveUser, getTestActor, inRolledBackTransaction, seededCategoryAndUnit } from "./support/fixtures";

const TODAY = todayInTz();
const FUTURE = addDays(TODAY, 120);
const record = async () => {};
const noAlerts = { evaluate: async () => {} };
const noReceiptAlerts = { publishIssues: async () => {} };

const raceSupplierIds: string[] = [];

afterAll(async () => {
  // Receipts, deliveries and the supplier can go; lots and movements are permanent (append-only history).
  await prisma.receipt.deleteMany({ where: { supplierId: { in: raceSupplierIds } } });
  await prisma.scheduledDelivery.deleteMany({ where: { supplierId: { in: raceSupplierIds } } });
  await prisma.supplier.deleteMany({ where: { id: { in: raceSupplierIds } } });
  await prisma.$disconnect();
});

const line = (productId: string, lotNumber: string, quantity: number, damagedQuantity = 0, expiryDate = FUTURE): ReceiptLine => ({
  productId,
  lotNumber,
  expiryDate,
  quantity,
  damagedQuantity,
  unitCost: "10.50",
});

const content = (lines: ReceiptLine[], overrides: Partial<ReceiptContent> = {}): ReceiptContent => ({
  invoiceNumber: "R-0001-00001234",
  notes: null,
  isPartial: false,
  lines,
  manualIssues: [],
  ...overrides,
});

async function setup(tx: DbClient, overrides: Parameters<typeof buildReceivingModule>[0] = {}) {
  const admin = await createActiveUser(tx, "admin");
  const supplier = await tx.supplier.create({ data: { name: `TEST proveedor ${crypto.randomUUID()}` } });
  const { categoryId, unitId } = await seededCategoryAndUnit(tx);
  const makeProduct = (name: string) => tx.product.create({ data: { code: `TEST-${crypto.randomUUID()}`, commercialName: name, categoryId, unitId } });
  const [a, b] = await Promise.all([makeProduct("TEST recepción A"), makeProduct("TEST recepción B")]);
  const { deliveryService } = buildDeliveriesModule({ db: tx, transact: (work) => work(tx), audit: record });
  const { receivingService } = buildReceivingModule({
    db: tx,
    transact: (work) => work(tx),
    audit: record,
    receiptAlerts: noReceiptAlerts,
    stockAlerts: noAlerts,
    ...overrides,
  });
  const schedule = (expected: Array<[string, number]> = [], type: "DELIVERY" | "SALES_VISIT" = "DELIVERY") =>
    deliveryService.createDelivery(admin, {
      supplierId: supplier.id,
      scheduledAt: zonedInstant(addDays(TODAY, 1), "10:00"),
      type,
      orderNumber: null,
      responsibleUserId: null,
      notes: null,
      expectedItems: expected.map(([productId, expectedQuantity]) => ({ productId, expectedQuantity })),
    });
  const start = async (deliveryId: string | null) => (await receivingService.startDraft(admin, { deliveryId, supplierId: deliveryId ? null : supplier.id })).id;
  const keyOf = async (id: string) => (await receivingService.getReceipt(admin, id)).idempotencyKey;
  return { admin, supplier, a, b, tx, deliveryService, receivingService, schedule, start, keyOf };
}

describe("confirming a receipt", () => {
  it("creates lots and ENTRY movements, stocks only good units, closes the delivery and records issues (spec #4)", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { admin, supplier, a, b, receivingService, deliveryService, schedule, start, keyOf } = await setup(tx);
      const delivery = await schedule([
        [a.id, 10],
        [b.id, 5],
      ]);
      const receiptId = await start(delivery.id);
      const result = await receivingService.confirmReceipt(admin, receiptId, await keyOf(receiptId), content([line(a.id, "L1", 6), line(a.id, "L2", 4, 1), line(b.id, "LB", 5)]));
      expect(result).toMatchObject({ receiptId, replayed: false, issueCount: 1 });

      const lots = await tx.lot.findMany({ where: { productId: { in: [a.id, b.id] } }, orderBy: [{ productId: "asc" }, { lotNumber: "asc" }] });
      const byKey = Object.fromEntries(lots.map((lot) => [lot.lotNumber, lot]));
      expect(byKey.L1).toMatchObject({ currentQuantity: 6, initialQuantity: 6, supplierId: supplier.id, invoiceNumber: "R-0001-00001234", status: "AVAILABLE" });
      expect(byKey.L2.currentQuantity).toBe(3); // 4 received, 1 damaged
      expect(byKey.LB.currentQuantity).toBe(5);
      expect(byKey.L1.unitCost?.toFixed(2)).toBe("10.50");
      expect(byKey.L1.receiptLineId).not.toBeNull();

      const movements = await tx.stockMovement.findMany({ where: { referenceType: "receipt", referenceId: receiptId } });
      expect(movements.map((m) => `${m.type}:${m.quantity}`).sort()).toEqual(["ENTRY:3", "ENTRY:5", "ENTRY:6"]);
      expect(movements.every((m) => m.userId === admin.id)).toBe(true);

      const receipt = await receivingService.getReceipt(admin, receiptId);
      expect(receipt).toMatchObject({ status: "CONFIRMED", confirmedById: admin.id, isPartial: false });
      expect(receipt.confirmedAt).not.toBeNull();
      expect(receipt.issues).toMatchObject([{ type: "DAMAGED", productId: a.id, quantity: 1 }]);
      expect((await deliveryService.getDelivery(admin, delivery.id)).status).toBe("RECEIVED");
    });
  });

  it("is idempotent: the same key returns the first result without duplicating; another key conflicts (spec #5)", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { admin, a, receivingService, start, keyOf } = await setup(tx);
      const receiptId = await start(null);
      const key = await keyOf(receiptId);
      const first = await receivingService.confirmReceipt(admin, receiptId, key, content([line(a.id, "L1", 7)]));
      const again = await receivingService.confirmReceipt(admin, receiptId, key, content([line(a.id, "L1", 7)]));

      expect(first.replayed).toBe(false);
      expect(again).toMatchObject({ receiptId, replayed: true });
      expect(await tx.stockMovement.count({ where: { referenceType: "receipt", referenceId: receiptId } })).toBe(1);
      expect((await tx.lot.findFirstOrThrow({ where: { productId: a.id } })).currentQuantity).toBe(7);

      await expect(receivingService.confirmReceipt(admin, receiptId, crypto.randomUUID(), content([line(a.id, "L1", 7)]))).rejects.toBeInstanceOf(ConflictError);
      // A different content with the same key is still the same receipt: replayed, never applied.
      const changed = await receivingService.confirmReceipt(admin, receiptId, key, content([line(a.id, "L1", 99)]));
      expect(changed.replayed).toBe(true);
      expect((await tx.lot.findFirstOrThrow({ where: { productId: a.id } })).currentQuantity).toBe(7);
      // A confirmed receipt cannot be edited or discarded.
      await expect(receivingService.saveDraft(admin, receiptId, content([line(a.id, "L1", 1)]))).rejects.toBeInstanceOf(ConflictError);
      await expect(receivingService.discardDraft(admin, receiptId)).rejects.toBeInstanceOf(ConflictError);
    });
  });

  it("rejects a wrong idempotency key on a draft", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { admin, a, receivingService, start } = await setup(tx);
      const receiptId = await start(null);
      await expect(receivingService.confirmReceipt(admin, receiptId, crypto.randomUUID(), content([line(a.id, "L1", 1)]))).rejects.toBeInstanceOf(ConflictError);
      expect((await receivingService.getReceipt(admin, receiptId)).status).toBe("DRAFT");
    });
  });

  it("rejects an expired lot, a receipt without lines and a zero quantity, leaving stock untouched", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { admin, a, receivingService, start, keyOf } = await setup(tx);
      const receiptId = await start(null);
      const key = await keyOf(receiptId);

      const expired = await receivingService.confirmReceipt(admin, receiptId, key, content([line(a.id, "OLD", 5, 0, addDays(TODAY, -1))])).catch((error) => error);
      expect(expired).toBeInstanceOf(ValidationError);
      expect(expired.fieldErrors.lines[0]).toBe("Línea 1: la fecha de vencimiento ya pasó: no se puede ingresar un lote vencido.");
      await expect(receivingService.confirmReceipt(admin, receiptId, key, content([]))).rejects.toBeInstanceOf(ValidationError);
      await expect(receivingService.confirmReceipt(admin, receiptId, key, content([line(a.id, "Z", 0)]))).rejects.toBeInstanceOf(ValidationError);

      expect(await tx.lot.count({ where: { productId: a.id } })).toBe(0);
      expect((await receivingService.getReceipt(admin, receiptId)).status).toBe("DRAFT");
      // The form schema rejects zero quantities before they reach the service.
      const parsed = receiptContentSchema.safeParse({
        lines: JSON.stringify([{ productId: a.id, lotNumber: "Z", expiry: "01/01/2033", quantity: "0", damagedQuantity: "", unitCost: "" }]),
      });
      expect(parsed.success).toBe(false);
    });
  });

  it("an expired existing lot cannot receive more stock either", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { admin, a, receivingService, start, keyOf } = await setup(tx);
      const pastDate = addDays(TODAY, -3);
      await tx.lot.create({ data: { productId: a.id, lotNumber: "VIEJO", expiryDate: toDbDate(pastDate), initialQuantity: 2, currentQuantity: 2 } });
      const receiptId = await start(null);
      // The domain rule rejects it first; the stock entry rule would too (an expired lot only takes write-offs).
      await expect(receivingService.confirmReceipt(admin, receiptId, await keyOf(receiptId), content([line(a.id, "VIEJO", 1, 0, pastDate)]))).rejects.toBeInstanceOf(ValidationError);
      expect((await tx.lot.findFirstOrThrow({ where: { productId: a.id } })).currentQuantity).toBe(2);
    });
  });

  it("does not stock damaged units: all-damaged lines create no lot, partly damaged ones only the good units", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { admin, a, b, receivingService, start, keyOf } = await setup(tx);
      const receiptId = await start(null);
      await receivingService.confirmReceipt(admin, receiptId, await keyOf(receiptId), content([line(a.id, "ROTO", 5, 5), line(b.id, "MIXTO", 5, 2)]));

      expect(await tx.lot.count({ where: { productId: a.id } })).toBe(0);
      expect((await tx.lot.findFirstOrThrow({ where: { productId: b.id } })).currentQuantity).toBe(3);
      expect(await tx.stockMovement.count({ where: { referenceType: "receipt", referenceId: receiptId } })).toBe(1);
      const issues = (await receivingService.getReceipt(admin, receiptId)).issues;
      expect(issues.map((issue) => `${issue.type}:${issue.quantity}`).sort()).toEqual(["DAMAGED:2", "DAMAGED:5"]);
    });
  });

  it("adds to an existing lot with the same number and expiry, and creates separate lots for different ones", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { admin, a, receivingService, start, keyOf } = await setup(tx);
      await tx.lot.create({ data: { productId: a.id, lotNumber: "L1", expiryDate: toDbDate(FUTURE), initialQuantity: 4, currentQuantity: 4 } });
      const receiptId = await start(null);
      await receivingService.confirmReceipt(admin, receiptId, await keyOf(receiptId), content([line(a.id, "L1", 6), line(a.id, "L1", 1, 0, addDays(FUTURE, 30))]));

      const lots = await tx.lot.findMany({ where: { productId: a.id }, orderBy: { expiryDate: "asc" } });
      expect(lots.map((lot) => `${lot.lotNumber}:${lot.currentQuantity}`)).toEqual(["L1:10", "L1:1"]);
      const movements = await tx.stockMovement.findMany({ where: { referenceId: receiptId }, orderBy: { balanceAfter: "desc" } });
      expect(movements.map((m) => m.balanceAfter)).toEqual([10, 1]);
    });
  });

  it("records a shortage when the receipt is complete but short, and an excess for unexpected units", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { admin, a, b, receivingService, deliveryService, schedule, start, keyOf } = await setup(tx);
      const delivery = await schedule([[a.id, 10]]);
      const receiptId = await start(delivery.id);
      await receivingService.confirmReceipt(admin, receiptId, await keyOf(receiptId), content([line(a.id, "L1", 7), line(b.id, "LB", 2)]));
      const issues = (await receivingService.getReceipt(admin, receiptId)).issues;
      expect(issues.map((issue) => `${issue.type}:${issue.productId === a.id ? "A" : "B"}:${issue.quantity}`).sort()).toEqual(["EXCESS:B:2", "SHORTAGE:A:3"]);
      expect((await deliveryService.getDelivery(admin, delivery.id)).status).toBe("RECEIVED");
    });
  });

  it("keeps manual issues and a partial receipt leaves the delivery open for the remainder", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { admin, a, receivingService, deliveryService, schedule, start, keyOf } = await setup(tx);
      const delivery = await schedule([[a.id, 10]]);

      const first = await start(delivery.id);
      await receivingService.confirmReceipt(
        admin,
        first,
        await keyOf(first),
        content([line(a.id, "L1", 6)], { isPartial: true, manualIssues: [{ type: "OTHER", productId: null, quantity: null, description: "Caja golpeada" }] }),
      );
      expect((await receivingService.getReceipt(admin, first)).issues).toMatchObject([{ type: "OTHER", description: "Caja golpeada" }]); // no shortage: partial
      expect((await deliveryService.getDelivery(admin, delivery.id)).status).toBe("CONFIRMED");

      // The remainder is a new receipt that only expects what is still pending.
      const second = await start(delivery.id);
      expect(second).not.toBe(first);
      expect((await receivingService.getEditorContext(admin, second)).expected[0]).toMatchObject({ expected: 10, alreadyReceived: 6, pending: 4 });
      await receivingService.confirmReceipt(admin, second, await keyOf(second), content([line(a.id, "L2", 4)]));
      expect((await receivingService.getReceipt(admin, second)).issues).toEqual([]);
      expect((await deliveryService.getDelivery(admin, delivery.id)).status).toBe("RECEIVED");
      expect((await tx.lot.findMany({ where: { productId: a.id } })).reduce((sum, lot) => sum + lot.currentQuantity, 0)).toBe(10);
      // A received delivery cannot be received again.
      await expect(receivingService.startDraft(admin, { deliveryId: delivery.id, supplierId: null })).rejects.toBeInstanceOf(ConflictError);
    });
  });
});

describe("starting and saving drafts", () => {
  it("pre-fills the supplier from the delivery and reuses an open draft", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { admin, supplier, a, receivingService, schedule, start } = await setup(tx);
      const delivery = await schedule([[a.id, 3]]);
      const first = await start(delivery.id);
      expect(await start(delivery.id)).toBe(first);
      const receipt = await receivingService.getReceipt(admin, first);
      expect(receipt).toMatchObject({ supplierId: supplier.id, deliveryId: delivery.id, status: "DRAFT" });
      expect(receipt.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
      const { expected } = await receivingService.getEditorContext(admin, first);
      expect(expected).toMatchObject([{ productId: a.id, expected: 3, pending: 3 }]);
    });
  });

  it("saves and resumes a draft with lines and manual issues", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { admin, a, b, receivingService, start } = await setup(tx);
      const receiptId = await start(null);
      await receivingService.saveDraft(
        admin,
        receiptId,
        content([line(a.id, "L1", 4, 1), line(b.id, "LB", 2)], { notes: "Llegó a la tarde", manualIssues: [{ type: "WRONG_PRODUCT", productId: b.id, quantity: 1, description: "Pedido equivocado" }] }),
      );
      const saved = await receivingService.getReceipt(admin, receiptId);
      expect(saved).toMatchObject({ status: "DRAFT", notes: "Llegó a la tarde", invoiceNumber: "R-0001-00001234" });
      expect(saved.lines.map((l) => `${l.lotNumber}:${l.quantity}:${l.damagedQuantity}`).sort()).toEqual(["L1:4:1", "LB:2:0"]);
      expect(saved.issues).toMatchObject([{ type: "WRONG_PRODUCT", description: "Pedido equivocado" }]);
      expect(await tx.lot.count({ where: { productId: a.id } })).toBe(0); // nothing stocked by a draft

      // Saving again replaces the content.
      await receivingService.saveDraft(admin, receiptId, content([line(a.id, "L9", 1)]));
      expect((await receivingService.getReceipt(admin, receiptId)).lines).toHaveLength(1);
    });
  });

  it("refuses sales visits, closed deliveries, inactive suppliers, partial without a delivery and archived products", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { admin, supplier, a, receivingService, deliveryService, schedule, start } = await setup(tx);
      const visit = await schedule([], "SALES_VISIT");
      await expect(receivingService.startDraft(admin, { deliveryId: visit.id, supplierId: null })).rejects.toBeInstanceOf(ConflictError);

      const cancelled = await schedule();
      await deliveryService.cancelDelivery(admin, cancelled.id, null);
      await expect(receivingService.startDraft(admin, { deliveryId: cancelled.id, supplierId: null })).rejects.toBeInstanceOf(ConflictError);
      await expect(receivingService.startDraft(admin, { deliveryId: crypto.randomUUID(), supplierId: null })).rejects.toBeInstanceOf(NotFoundError);

      const draft = await start(null);
      await expect(receivingService.saveDraft(admin, draft, content([line(a.id, "L1", 1)], { isPartial: true }))).rejects.toBeInstanceOf(ValidationError);
      await tx.product.update({ where: { id: a.id }, data: { status: "ARCHIVED" } });
      await expect(receivingService.saveDraft(admin, draft, content([line(a.id, "L1", 1)]))).rejects.toBeInstanceOf(ValidationError);
      await expect(receivingService.saveDraft(admin, draft, content([line(crypto.randomUUID(), "L1", 1)]))).rejects.toBeInstanceOf(ValidationError);

      await tx.supplier.update({ where: { id: supplier.id }, data: { status: "INACTIVE" } });
      await expect(receivingService.startDraft(admin, { deliveryId: null, supplierId: supplier.id })).rejects.toBeInstanceOf(ValidationError);
    });
  });

  it("a sales-visit delivery is rejected at confirm even if the draft already existed", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { admin, a, receivingService, schedule, start, keyOf } = await setup(tx);
      const delivery = await schedule();
      const receiptId = await start(delivery.id);
      await tx.scheduledDelivery.update({ where: { id: delivery.id }, data: { type: "SALES_VISIT" } });
      await expect(receivingService.confirmReceipt(admin, receiptId, await keyOf(receiptId), content([line(a.id, "L1", 1)]))).rejects.toBeInstanceOf(ConflictError);
      expect(await tx.lot.count({ where: { productId: a.id } })).toBe(0);
    });
  });

  it("discards a draft", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { admin, receivingService, start } = await setup(tx);
      const receiptId = await start(null);
      await receivingService.discardDraft(admin, receiptId);
      await expect(receivingService.getReceipt(admin, receiptId)).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  it("requires the receiving permissions", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { admin, a, receivingService, start } = await setup(tx);
      const receiptId = await start(null);
      const reader: AuthUser = { ...admin, roleName: "employee", permissions: ["receiving.read"] };
      const nobody: AuthUser = { ...admin, roleName: "employee", permissions: [] };
      await expect(receivingService.confirmReceipt(reader, receiptId, "x".repeat(12), content([line(a.id, "L", 1)]))).rejects.toBeInstanceOf(ForbiddenError);
      await expect(receivingService.saveDraft(reader, receiptId, content([]))).rejects.toBeInstanceOf(ForbiddenError);
      await expect(receivingService.startDraft(reader, { deliveryId: null, supplierId: null })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(receivingService.getReceipt(reader, receiptId)).resolves.toMatchObject({ id: receiptId });
      await expect(receivingService.getReceipt(nobody, receiptId)).rejects.toBeInstanceOf(ForbiddenError);
    });
    const employee = await getTestActor("employee");
    expect(employee.permissions).toEqual(expect.arrayContaining(["receiving.read", "receiving.write"]));
  });
});

describe("after commit", () => {
  it("a failing notification never rolls back a confirmed receipt", async () => {
    await inRolledBackTransaction(async (tx) => {
      const failures: unknown[] = [];
      const { admin, a, receivingService, start, keyOf } = await setup(tx, {
        receiptAlerts: { publishIssues: async () => Promise.reject(new Error("push provider down")) },
        stockAlerts: { evaluate: async () => Promise.reject(new Error("stock alerts down")) },
        onAlertError: (error) => failures.push(error),
      });
      const receiptId = await start(null);
      const result = await receivingService.confirmReceipt(admin, receiptId, await keyOf(receiptId), content([line(a.id, "L1", 5, 1)]));

      expect(result).toMatchObject({ replayed: false, issueCount: 1 });
      expect(failures).toHaveLength(2);
      expect((await receivingService.getReceipt(admin, receiptId)).status).toBe("CONFIRMED");
      expect((await tx.lot.findFirstOrThrow({ where: { productId: a.id } })).currentQuantity).toBe(4);
      expect(await tx.stockMovement.count({ where: { referenceType: "receipt", referenceId: receiptId } })).toBe(1);
    });
  });

  it("publishes an idempotent RECEIPT_ISSUE alert with notifications only when there are issues", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { admin, a, receivingService, start, keyOf } = await setup(tx, { receiptAlerts: new PrismaReceiptAlerts(tx) });
      const clean = await start(null);
      await receivingService.confirmReceipt(admin, clean, await keyOf(clean), content([line(a.id, "L1", 5)]));
      expect(await tx.alertEvent.count({ where: { rule: "RECEIPT_ISSUE", entityId: clean } })).toBe(0);

      const withIssues = await start(null);
      await receivingService.confirmReceipt(admin, withIssues, await keyOf(withIssues), content([line(a.id, "L2", 5, 2)]));
      const events = await tx.alertEvent.findMany({ where: { rule: "RECEIPT_ISSUE", entityId: withIssues } });
      expect(events).toHaveLength(1);
      const notifications = await tx.notification.findMany({ where: { alertEventId: events[0].id } });
      expect(notifications.some((n) => n.userId === admin.id)).toBe(true);
      expect(notifications[0]).toMatchObject({ link: `/recepciones/${withIssues}`, priority: "MEDIUM" });

      // Publishing again (a retry) creates nothing new.
      const before = notifications.length;
      await new PrismaReceiptAlerts(tx).publishIssues({ id: withIssues, supplierName: "x", issueCount: 1 }, TODAY);
      expect(await tx.alertEvent.count({ where: { rule: "RECEIPT_ISSUE", entityId: withIssues } })).toBe(1);
      expect(await tx.notification.count({ where: { alertEventId: events[0].id } })).toBe(before);
    });
  });

  it("re-evaluates the stock level of the received products", async () => {
    await inRolledBackTransaction(async (tx) => {
      const evaluated: string[] = [];
      const { admin, a, b, receivingService, start, keyOf } = await setup(tx, { stockAlerts: { evaluate: async (productId) => void evaluated.push(productId) } });
      const receiptId = await start(null);
      // Product B arrives fully damaged: no stock entered, so there is nothing to re-evaluate for it.
      await receivingService.confirmReceipt(admin, receiptId, await keyOf(receiptId), content([line(a.id, "L1", 5), line(a.id, "L2", 2), line(b.id, "LB", 1, 1)]));
      expect(evaluated).toEqual([a.id]);
    });
  });
});

describe("concurrent double confirm (real transactions)", () => {
  it("two simultaneous confirms with the same key apply the receipt exactly once", async () => {
    const actor = await getTestActor("admin");
    const supplier = await prisma.supplier.create({ data: { name: `TEST proveedor carrera ${crypto.randomUUID()}` } });
    raceSupplierIds.push(supplier.id);
    const { categoryId, unitId } = await seededCategoryAndUnit();
    const product = await prisma.product.create({ data: { code: `TEST-${crypto.randomUUID()}`, commercialName: "TEST recepción concurrente", categoryId, unitId } });
    const { receivingService } = buildReceivingModule({ audit: record, receiptAlerts: noReceiptAlerts, stockAlerts: noAlerts });

    const { id: receiptId } = await receivingService.startDraft(actor, { deliveryId: null, supplierId: supplier.id });
    const key = (await receivingService.getReceipt(actor, receiptId)).idempotencyKey;
    const body = content([line(product.id, "RACE-1", 6), line(product.id, "RACE-2", 4)]);
    const results = await Promise.allSettled([
      receivingService.confirmReceipt(actor, receiptId, key, body),
      receivingService.confirmReceipt(actor, receiptId, key, body),
    ]);

    expect(results.every((result) => result.status === "fulfilled")).toBe(true);
    const outcomes = results.map((result) => (result as PromiseFulfilledResult<{ replayed: boolean }>).value.replayed).sort();
    expect(outcomes).toEqual([false, true]);
    expect(await prisma.stockMovement.count({ where: { referenceType: "receipt", referenceId: receiptId } })).toBe(2);
    const lots = await prisma.lot.findMany({ where: { productId: product.id } });
    expect(lots.reduce((sum, lot) => sum + lot.currentQuantity, 0)).toBe(10);
  });
});
