import type { RecordAudit } from "@/modules/audit/application/record-audit";
import { assertPermission, type AuthUser } from "@/modules/auth/domain/permissions";
import { ConflictError, NotFoundError, ValidationError } from "@/shared/domain/errors";
import { computeCompliance, computeComplianceBySupplier } from "../domain/compliance";
import { type DeliveryStatus, assertTransition, isOpenDelivery } from "../domain/delivery-status";
import type { CreateDeliveryInput, EditDeliveryInput, RescheduleDeliveryInput } from "./delivery-input";
import type {
  CalendarQuery,
  ComplianceQuery,
  DeliveryListQuery,
  DeliveryReadRepository,
  DeliveryRecord,
  DeliveryTx,
  DeliveryUnitOfWork,
  ExpectedItemData,
} from "./ports";

export interface DeliveryServiceDeps {
  uow: DeliveryUnitOfWork;
  reads: DeliveryReadRepository;
  audit: RecordAudit;
  now?: () => Date;
}

/** Fields recorded in the audit trail. */
function snapshot(delivery: DeliveryRecord) {
  return {
    supplierId: delivery.supplierId,
    scheduledAt: delivery.scheduledAt.toISOString(),
    type: delivery.type,
    status: delivery.status,
    orderNumber: delivery.orderNumber,
    responsibleUserId: delivery.responsibleUserId,
    notes: delivery.notes,
    rescheduledFromId: delivery.rescheduledFromId,
    expectedItems: delivery.expectedItems.map((item) => ({ productId: item.productId, expectedQuantity: item.expectedQuantity })),
  };
}

/**
 * Scheduled deliveries and visits. Every change is one transaction that locks the delivery row first, so
 * two people acting on the same delivery are serialized and the status machine always sees current state.
 * Reading needs `deliveries.read`; every change needs `deliveries.write`.
 */
export function createDeliveryService({ uow, reads, audit, now = () => new Date() }: DeliveryServiceDeps) {
  async function assertReferences(tx: DeliveryTx, input: { responsibleUserId: string | null; expectedItems: ExpectedItemData[] }, previous?: DeliveryRecord) {
    const errors: Record<string, string[]> = {};
    if (input.responsibleUserId && !(await tx.userIsActive(input.responsibleUserId))) {
      errors.responsibleUserId = ["El responsable elegido no existe o está inactivo."];
    }
    if (input.expectedItems.length > 0) {
      const statuses = await tx.productStatuses(input.expectedItems.map((item) => item.productId));
      const kept = new Set(previous?.expectedItems.map((item) => item.productId));
      for (const item of input.expectedItems) {
        const status = statuses.get(item.productId);
        if (!status) errors.items = ["Hay un producto esperado que no existe."];
        else if (status === "ARCHIVED" && !kept.has(item.productId)) errors.items = ["Hay un producto esperado archivado."];
      }
    }
    if (Object.keys(errors).length > 0) throw new ValidationError("Invalid references", errors);
  }

  async function lockOrFail(tx: DeliveryTx, id: string) {
    const delivery = await tx.lock(id);
    if (!delivery) throw new NotFoundError("delivery");
    return delivery;
  }

  async function createDelivery(actor: AuthUser, input: CreateDeliveryInput, ip?: string) {
    assertPermission(actor, "deliveries.write");
    const created = await uow.run(async (tx) => {
      const supplier = await tx.supplierStatus(input.supplierId);
      if (!supplier) throw new ValidationError("Supplier not found", { supplierId: ["El proveedor elegido no existe."] });
      if (supplier === "INACTIVE") throw new ValidationError("Supplier inactive", { supplierId: ["El proveedor está inactivo: activalo para programar entregas."] });
      await assertReferences(tx, input);
      return tx.create(input);
    });
    await audit({ actorId: actor.id, action: "delivery.create", entityType: "delivery", entityId: created.id, after: snapshot(created), ip });
    return created;
  }

  async function updateDelivery(actor: AuthUser, id: string, input: EditDeliveryInput, ip?: string) {
    assertPermission(actor, "deliveries.write");
    const { previous, updated } = await uow.run(async (tx) => {
      const current = await lockOrFail(tx, id);
      if (!isOpenDelivery(current.status)) {
        throw new ConflictError("Delivery is closed", "Solo se pueden editar entregas programadas o confirmadas.");
      }
      if (input.type !== current.type && (await tx.hasReceipts(id))) {
        throw new ConflictError("Delivery has receipts", "No se puede cambiar el tipo: la entrega ya tiene recepciones.", {
          type: ["No se puede cambiar el tipo: la entrega ya tiene recepciones."],
        });
      }
      await assertReferences(tx, input, current);
      return { previous: current, updated: await tx.update(id, input) };
    });
    await audit({ actorId: actor.id, action: "delivery.update", entityType: "delivery", entityId: id, before: snapshot(previous), after: snapshot(updated), ip });
    return updated;
  }

  /** Moves an open delivery to `to` (never RECEIVED: that happens when a receipt is confirmed). */
  async function transition(actor: AuthUser, id: string, to: "CONFIRMED" | "COMPLETED" | "CANCELLED", action: string, extra: Record<string, unknown>, ip?: string) {
    assertPermission(actor, "deliveries.write");
    const before = await uow.run(async (tx) => {
      const current = await lockOrFail(tx, id);
      assertTransition(current.status, to, current.type);
      await tx.setStatus(id, to);
      return current.status;
    });
    await audit({ actorId: actor.id, action, entityType: "delivery", entityId: id, before: { status: before }, after: { status: to, ...extra }, ip });
  }

  const confirmDelivery = (actor: AuthUser, id: string, ip?: string) => transition(actor, id, "CONFIRMED", "delivery.confirm", {}, ip);
  /** A visit (sales visit, order taking, other) took place. Deliveries are closed by receiving them instead. */
  const completeDelivery = (actor: AuthUser, id: string, ip?: string) => transition(actor, id, "COMPLETED", "delivery.complete", {}, ip);
  const cancelDelivery = (actor: AuthUser, id: string, reason: string | null, ip?: string) =>
    transition(actor, id, "CANCELLED", "delivery.cancel", { reason }, ip);

  /**
   * Reschedule = the original becomes RESCHEDULED and a NEW SCHEDULED delivery (same supplier, type, order,
   * responsible, notes and expected items) is linked to it through `rescheduledFromId`, so the history stays.
   */
  async function rescheduleDelivery(actor: AuthUser, id: string, input: RescheduleDeliveryInput, ip?: string) {
    assertPermission(actor, "deliveries.write");
    if (input.scheduledAt.getTime() <= now().getTime()) {
      throw new ValidationError("New date in the past", { date: ["La nueva fecha tiene que ser posterior a este momento."] });
    }
    const { original, created } = await uow.run(async (tx) => {
      const current = await lockOrFail(tx, id);
      assertTransition(current.status, "RESCHEDULED", current.type);
      if (current.scheduledAt.getTime() === input.scheduledAt.getTime()) {
        throw new ValidationError("Same date", { date: ["Elegí una fecha u hora distinta de la actual."] });
      }
      await tx.setStatus(id, "RESCHEDULED");
      const next = await tx.create(
        {
          supplierId: current.supplierId,
          scheduledAt: input.scheduledAt,
          type: current.type,
          orderNumber: current.orderNumber,
          responsibleUserId: current.responsibleUserId,
          notes: current.notes,
          expectedItems: current.expectedItems.map((item) => ({ productId: item.productId, expectedQuantity: item.expectedQuantity })),
        },
        id,
      );
      return { original: current, created: next };
    });
    await audit({
      actorId: actor.id,
      action: "delivery.reschedule",
      entityType: "delivery",
      entityId: id,
      before: { status: original.status, scheduledAt: original.scheduledAt.toISOString() },
      after: { status: "RESCHEDULED", rescheduledToId: created.id, scheduledAt: created.scheduledAt.toISOString(), reason: input.reason },
      ip,
    });
    await audit({ actorId: actor.id, action: "delivery.create", entityType: "delivery", entityId: created.id, after: snapshot(created), ip });
    return created;
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  async function listDeliveries(actor: AuthUser, query: Omit<DeliveryListQuery, "now">) {
    assertPermission(actor, "deliveries.read");
    return reads.list({ ...query, now: now() });
  }

  async function getDelivery(actor: AuthUser, id: string) {
    assertPermission(actor, "deliveries.read");
    const delivery = await reads.findById(id);
    if (!delivery) throw new NotFoundError("delivery");
    return delivery;
  }

  async function listCalendar(actor: AuthUser, query: CalendarQuery) {
    assertPermission(actor, "deliveries.read");
    return reads.listForCalendar(query);
  }

  async function listOpenForSupplier(actor: AuthUser, supplierId: string, limit = 5) {
    assertPermission(actor, "deliveries.read");
    return reads.listOpenForSupplier(supplierId, limit);
  }

  async function complianceForSupplier(actor: AuthUser, supplierId: string, range: Omit<ComplianceQuery, "supplierId"> = {}) {
    assertPermission(actor, "deliveries.read");
    return computeCompliance(await reads.listComplianceRows({ ...range, supplierId }), now());
  }

  /** Compliance of every supplier with deliveries in the period, worst percentage first. */
  async function complianceReport(actor: AuthUser, range: ComplianceQuery = {}) {
    assertPermission(actor, "deliveries.read");
    const at = now();
    const rows = await reads.listComplianceRows(range);
    const summaries = computeComplianceBySupplier(rows, at);
    const names = await reads.supplierNames([...summaries.keys()]);
    return [...summaries]
      .map(([supplierId, summary]) => ({ supplierId, supplierName: names.get(supplierId) ?? "-", summary }))
      .sort((a, b) => (a.summary.onTimePercentage ?? 101) - (b.summary.onTimePercentage ?? 101) || a.supplierName.localeCompare(b.supplierName, "es"));
  }

  async function listOptions(actor: AuthUser) {
    assertPermission(actor, "deliveries.read");
    const [suppliers, users] = await Promise.all([reads.listSupplierOptions(), reads.listUserOptions()]);
    return { suppliers, users };
  }

  return {
    createDelivery,
    updateDelivery,
    confirmDelivery,
    completeDelivery,
    cancelDelivery,
    rescheduleDelivery,
    listDeliveries,
    getDelivery,
    listCalendar,
    listOpenForSupplier,
    complianceForSupplier,
    complianceReport,
    listOptions,
  };
}

export type DeliveryService = ReturnType<typeof createDeliveryService>;

export type { DeliveryStatus };
