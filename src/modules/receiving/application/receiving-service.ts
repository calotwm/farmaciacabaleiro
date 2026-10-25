import type { RecordAudit } from "@/modules/audit/application/record-audit";
import { assertPermission, type AuthUser } from "@/modules/auth/domain/permissions";
import { type DeliveryStatus, assertTransition, isGoodsDelivery } from "@/modules/deliveries/domain/delivery-status";
import type { StockLevelAlerts } from "@/modules/inventory/application/ports";
import { todayInTz } from "@/shared/domain/dates";
import { ConflictError, NotFoundError, ValidationError } from "@/shared/domain/errors";
import {
  type ProposedIssue,
  assertConfirmable,
  compareWithExpected,
  goodQuantity,
  nextDeliveryStatus,
  proposeIssues,
  remainingExpected,
} from "../domain/receipt";
import type {
  ReceiptAlerts,
  ReceiptContent,
  ReceiptListQuery,
  ReceivingReadRepository,
  ReceivingTx,
  ReceivingUnitOfWork,
} from "./ports";

export interface ReceivingServiceDeps {
  uow: ReceivingUnitOfWork;
  reads: ReceivingReadRepository;
  /** Notification of receipts with issues (after commit). */
  receiptAlerts: ReceiptAlerts;
  /** Re-evaluation of low-stock alerts for the received products (after commit). */
  stockAlerts: StockLevelAlerts;
  audit: RecordAudit;
  now?: () => Date;
  /** Key of a new draft; the editor sends it back on confirm. */
  newIdempotencyKey?: () => string;
  /** Receives failures of the post-commit notifications (default: console.error). */
  onAlertError?: (error: unknown) => void;
}

export interface ConfirmResult {
  receiptId: string;
  /** True when the receipt had already been confirmed with the same key: nothing was applied again. */
  replayed: boolean;
  issueCount: number;
}

const CONFIRMED_MESSAGE = "La recepción ya fue confirmada y no se puede modificar.";

/**
 * Goods receiving. A receipt is a DRAFT that can be saved and resumed; confirming it is ONE transaction:
 * lock the receipt (and its delivery), validate, enter every good unit into stock through the inventory
 * module's own entry rules, store the issues and update the delivery. Confirmation is idempotent: a repeat with the same
 * key returns the first result untouched; a different key on a confirmed receipt is a conflict.
 * Notifications run after the commit and can never undo a confirmed receipt.
 */
export function createReceivingService({
  uow,
  reads,
  receiptAlerts,
  stockAlerts,
  audit,
  now = () => new Date(),
  newIdempotencyKey = () => crypto.randomUUID(),
  onAlertError = console.error,
}: ReceivingServiceDeps) {
  async function assertProducts(tx: ReceivingTx, content: ReceiptContent) {
    const ids = [...new Set([...content.lines.map((line) => line.productId), ...content.manualIssues.flatMap((issue) => (issue.productId ? [issue.productId] : []))])];
    if (ids.length === 0) return;
    const statuses = await tx.productStatuses(ids);
    const missing = ids.some((id) => !statuses.has(id));
    const archived = content.lines.some((line) => statuses.get(line.productId) === "ARCHIVED");
    if (missing) throw new ValidationError("Product not found", { lines: ["Hay un producto que no existe."] });
    if (archived) throw new ValidationError("Product archived", { lines: ["Hay un producto archivado: no se le puede ingresar stock."] });
  }

  async function lockReceiptOrFail(tx: ReceivingTx, id: string) {
    const receipt = await tx.lockReceipt(id);
    if (!receipt) throw new NotFoundError("receipt");
    return receipt;
  }

  /**
   * Starts a receipt from a scheduled delivery (a "Reparto" that is still open; an existing draft is reused) or,
   * without a delivery, for a supplier (unscheduled purchase).
   */
  async function startDraft(actor: AuthUser, input: { deliveryId: string | null; supplierId: string | null }, ip?: string) {
    assertPermission(actor, "receiving.write");
    const result = await uow.run(async (tx) => {
      if (input.deliveryId) {
        const delivery = await tx.lockDelivery(input.deliveryId);
        if (!delivery) throw new NotFoundError("delivery");
        if (!isGoodsDelivery(delivery.type)) {
          throw new ConflictError("Delivery is a visit", "Esta visita no trae mercadería: solo se pueden recibir los repartos.");
        }
        if (delivery.status !== "SCHEDULED" && delivery.status !== "CONFIRMED") {
          throw new ConflictError("Delivery is closed", "La entrega ya no está pendiente: no se puede registrar una recepción.");
        }
        const existing = await tx.findOpenDraftForDelivery(delivery.id);
        if (existing) return { id: existing, created: false, supplierId: delivery.supplierId };
        const id = await tx.createDraft({ supplierId: delivery.supplierId, deliveryId: delivery.id, idempotencyKey: newIdempotencyKey() });
        return { id, created: true, supplierId: delivery.supplierId };
      }
      if (!input.supplierId) throw new ValidationError("Supplier required", { supplierId: ["Elegí un proveedor."] });
      const status = await tx.supplierStatus(input.supplierId);
      if (!status) throw new ValidationError("Supplier not found", { supplierId: ["El proveedor elegido no existe."] });
      if (status === "INACTIVE") throw new ValidationError("Supplier inactive", { supplierId: ["El proveedor está inactivo: activalo para recibir mercadería."] });
      const id = await tx.createDraft({ supplierId: input.supplierId, deliveryId: null, idempotencyKey: newIdempotencyKey() });
      return { id, created: true, supplierId: input.supplierId };
    });
    if (result.created) {
      await audit({
        actorId: actor.id,
        action: "receipt.start",
        entityType: "receipt",
        entityId: result.id,
        after: { supplierId: result.supplierId, deliveryId: input.deliveryId },
        ip,
      });
    }
    return { id: result.id, created: result.created };
  }

  /** Saves the editor content of a draft (lines, manual issues, invoice, notes, partial flag). */
  async function saveDraft(actor: AuthUser, receiptId: string, content: ReceiptContent, ip?: string) {
    assertPermission(actor, "receiving.write");
    await uow.run(async (tx) => {
      const receipt = await lockReceiptOrFail(tx, receiptId);
      if (receipt.status === "CONFIRMED") throw new ConflictError("Receipt confirmed", CONFIRMED_MESSAGE);
      if (content.isPartial && !receipt.deliveryId) {
        throw new ValidationError("Partial without delivery", { isPartial: ["Solo una recepción de una entrega programada puede ser parcial."] });
      }
      await assertProducts(tx, content);
      await tx.replaceContent(receiptId, content);
    });
    await audit({
      actorId: actor.id,
      action: "receipt.save_draft",
      entityType: "receipt",
      entityId: receiptId,
      after: { lines: content.lines.length, manualIssues: content.manualIssues.length, isPartial: content.isPartial },
      ip,
    });
  }

  async function discardDraft(actor: AuthUser, receiptId: string, ip?: string) {
    assertPermission(actor, "receiving.write");
    await uow.run(async (tx) => {
      const receipt = await lockReceiptOrFail(tx, receiptId);
      if (receipt.status === "CONFIRMED") throw new ConflictError("Receipt confirmed", "Una recepción confirmada no se puede descartar.");
      await tx.deleteDraft(receiptId);
    });
    await audit({ actorId: actor.id, action: "receipt.discard", entityType: "receipt", entityId: receiptId, ip });
  }

  async function confirmReceipt(actor: AuthUser, receiptId: string, idempotencyKey: string, content: ReceiptContent, ip?: string): Promise<ConfirmResult> {
    assertPermission(actor, "receiving.write");
    const at = now();
    const today = todayInTz(at);

    const outcome = await uow.run(async (tx) => {
      // The row lock makes a concurrent second confirm wait here and then find the receipt confirmed.
      const receipt = await lockReceiptOrFail(tx, receiptId);
      if (receipt.status === "CONFIRMED") {
        if (receipt.idempotencyKey === idempotencyKey) return { replayed: true as const, receipt };
        throw new ConflictError("Receipt already confirmed", CONFIRMED_MESSAGE);
      }
      if (receipt.idempotencyKey !== idempotencyKey) {
        throw new ConflictError("Idempotency key mismatch", "La clave de confirmación no corresponde a esta recepción. Recargá la página.");
      }

      assertConfirmable(content.lines, today);
      if (content.isPartial && !receipt.deliveryId) {
        throw new ValidationError("Partial without delivery", { isPartial: ["Solo una recepción de una entrega programada puede ser parcial."] });
      }
      await assertProducts(tx, content);

      let deliveryUpdate: { id: string; status: DeliveryStatus } | null = null;
      let pending: Array<{ productId: string; expectedQuantity: number }> = [];
      if (receipt.deliveryId) {
        const delivery = await tx.lockDelivery(receipt.deliveryId);
        if (!delivery) throw new NotFoundError("delivery");
        if (!isGoodsDelivery(delivery.type)) {
          throw new ConflictError("Delivery is a visit", "Esta visita no trae mercadería: solo se pueden recibir los repartos.");
        }
        // The status machine decides whether the delivery can still be received (not cancelled, rescheduled, already received).
        assertTransition(delivery.status, "RECEIVED", delivery.type);
        const next = nextDeliveryStatus(delivery.status, content.isPartial);
        if (next) deliveryUpdate = { id: delivery.id, status: next };
        const [expected, already] = await Promise.all([tx.deliveryExpected(delivery.id), tx.receivedSoFar(delivery.id, receipt.id)]);
        pending = remainingExpected(expected, already);
      }

      const proposed: ProposedIssue[] = proposeIssues(compareWithExpected(pending, content.lines), { isPartial: content.isPartial });
      const stored = await tx.replaceContent(receipt.id, content);

      // Product locks are taken in a fixed order (product id, then lot) so concurrent receipts cannot deadlock.
      const ordered = [...stored].sort((a, b) => a.productId.localeCompare(b.productId) || a.lotNumber.localeCompare(b.lotNumber));
      for (const line of ordered) {
        const good = goodQuantity(line);
        // Damaged units are recorded as issues and never enter stock.
        if (good < 1) continue;
        await tx.enterStock({
          actorId: actor.id,
          productId: line.productId,
          lotNumber: line.lotNumber,
          expiryDate: line.expiryDate,
          quantity: good,
          unitCost: line.unitCost,
          supplierId: receipt.supplierId,
          invoiceNumber: content.invoiceNumber,
          receiptId: receipt.id,
          receiptLineId: line.id,
          at,
          today,
        });
      }

      const issues = [...content.manualIssues, ...proposed];
      await tx.markConfirmed(receipt.id, { confirmedById: actor.id, confirmedAt: at, isPartial: content.isPartial, issues });
      if (deliveryUpdate) await tx.setDeliveryStatus(deliveryUpdate.id, deliveryUpdate.status);
      return {
        replayed: false as const,
        receipt,
        issues,
        productIds: [...new Set(stored.filter((line) => goodQuantity(line) > 0).map((line) => line.productId))],
        deliveryStatus: deliveryUpdate?.status ?? null,
      };
    });

    if (outcome.replayed) return { receiptId, replayed: true, issueCount: outcome.receipt.issues.length };

    // Outside the transaction: nothing below can roll back (or fail) a confirmed receipt.
    if (outcome.issues.length > 0) {
      try {
        await receiptAlerts.publishIssues({ id: receiptId, supplierName: outcome.receipt.supplierName, issueCount: outcome.issues.length }, today);
      } catch (error) {
        onAlertError(error);
      }
    }
    for (const productId of outcome.productIds) {
      try {
        await stockAlerts.evaluate(productId, today);
      } catch (error) {
        onAlertError(error);
      }
    }
    await audit({
      actorId: actor.id,
      action: "receipt.confirm",
      entityType: "receipt",
      entityId: receiptId,
      after: {
        supplierId: outcome.receipt.supplierId,
        deliveryId: outcome.receipt.deliveryId,
        invoiceNumber: content.invoiceNumber,
        isPartial: content.isPartial,
        lines: content.lines,
        issues: outcome.issues,
        deliveryStatus: outcome.deliveryStatus,
      },
      ip,
    });
    return { receiptId, replayed: false, issueCount: outcome.issues.length };
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  async function listReceipts(actor: AuthUser, query: ReceiptListQuery) {
    assertPermission(actor, "receiving.read");
    return reads.list(query);
  }

  async function getReceipt(actor: AuthUser, id: string) {
    assertPermission(actor, "receiving.read");
    const receipt = await reads.findById(id);
    if (!receipt) throw new NotFoundError("receipt");
    return receipt;
  }

  /** What the editor needs besides the receipt: the delivery's expected products and what is still pending. */
  async function getEditorContext(actor: AuthUser, id: string) {
    const receipt = await getReceipt(actor, id);
    const expected = receipt.deliveryId ? await reads.expectedProducts(receipt.deliveryId, receipt.id) : [];
    return { receipt, expected };
  }

  async function listMovements(actor: AuthUser, receiptId: string) {
    assertPermission(actor, "receiving.read");
    return reads.listMovements(receiptId);
  }

  async function listForDelivery(actor: AuthUser, deliveryId: string) {
    assertPermission(actor, "receiving.read");
    return reads.listForDelivery(deliveryId);
  }

  async function listRecentForSupplier(actor: AuthUser, supplierId: string, limit = 5) {
    assertPermission(actor, "receiving.read");
    return reads.listRecentForSupplier(supplierId, limit);
  }

  async function listSupplierOptions(actor: AuthUser) {
    assertPermission(actor, "receiving.read");
    return reads.listSupplierOptions();
  }

  return {
    startDraft,
    saveDraft,
    discardDraft,
    confirmReceipt,
    listReceipts,
    getReceipt,
    getEditorContext,
    listMovements,
    listForDelivery,
    listRecentForSupplier,
    listSupplierOptions,
  };
}

export type ReceivingService = ReturnType<typeof createReceivingService>;
