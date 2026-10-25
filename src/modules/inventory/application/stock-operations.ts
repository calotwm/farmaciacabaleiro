import type { RecordAudit } from "@/modules/audit/application/record-audit";
import { type AuthUser, type PermissionKey, assertPermission } from "@/modules/auth/domain/permissions";
import { type CalendarDate, todayInTz } from "@/shared/domain/dates";
import { ConflictError, NotFoundError, ValidationError } from "@/shared/domain/errors";
import type { LotState } from "../domain/lot";
import {
  type MovementPlan,
  assertNewLotExpiry,
  assertValidQuantity,
  planAddition,
  planBlock,
  planExit,
  planRemoval,
  planUnblock,
} from "../domain/movement-rules";
import { isWriteOffOrReturn, reasonKindFor, requiresReason } from "../domain/movement-type";
import type { MovementCommand } from "./movement-input";
import type { LockedProduct, MovementRef, StockLevelAlerts, StockTx, StockUnitOfWork } from "./ports";

export interface StockOperationsDeps {
  uow: StockUnitOfWork;
  alerts: StockLevelAlerts;
  audit: RecordAudit;
  now?: () => Date;
  /** Receives failures of the post-commit alert evaluation (default: console.error). */
  onAlertError?: (error: unknown) => void;
}

export interface MovementResult {
  productId: string;
  movements: MovementRef[];
}

/** Permission needed to register a movement of this type. */
export function permissionFor(type: MovementCommand["type"]): PermissionKey {
  return isWriteOffOrReturn(type) ? "inventory.writeoff" : "inventory.write";
}

/**
 * Registers stock movements. Every operation is ONE transaction: lock the product, read the lots
 * (current values), plan with the pure domain rules, update the lots and append the movements.
 * Low-stock alerts run after the commit and can never undo a movement.
 */
export function createStockOperations({ uow, alerts, audit, now = () => new Date(), onAlertError = console.error }: StockOperationsDeps) {
  /** Validates the reason against the catalog kind this movement type draws from. */
  async function resolveReason(tx: StockTx, command: MovementCommand) {
    const kind = reasonKindFor(command.type);
    const reasonText = command.reasonText?.trim() || null;
    // Entries and exits take free text only: a catalog id sent for them is ignored.
    const reasonId = kind ? (command.reasonId ?? null) : null;

    if (requiresReason(command.type) && !reasonId && !reasonText) {
      throw new ValidationError("Reason required", { reasonId: ["Elegí un motivo o escribí el detalle."] });
    }
    if (reasonId) {
      const reason = await tx.findReason(reasonId);
      if (!reason || !reason.active || reason.kind !== kind) {
        throw new ValidationError("Invalid reason", { reasonId: ["El motivo elegido no es válido para este movimiento."] });
      }
    }
    return { reasonId, reasonText };
  }

  function lotOf(lots: readonly LotState[], lotId: string): LotState {
    const lot = lots.find((candidate) => candidate.id === lotId);
    if (!lot) throw new ValidationError("Lot not found for product", { lotId: ["El lote elegido no pertenece al producto."] });
    return lot;
  }

  function assertCanReceiveStock(product: LockedProduct) {
    if (product.status === "ARCHIVED") {
      throw new ConflictError("Product is archived", "El producto está archivado: no se le puede ingresar stock.", {
        productId: ["El producto está archivado: no se le puede ingresar stock."],
      });
    }
  }

  /** ENTRY creates the lot, or adds to an existing one with the same number and expiry date. */
  async function planEntry(tx: StockTx, command: Extract<MovementCommand, { type: "ENTRY" }>, today: CalendarDate, at: Date): Promise<MovementPlan & { lotCreated: boolean }> {
    assertValidQuantity(command.quantity);
    const existing = await tx.findLotByKey(command.productId, command.lotNumber, command.expiryDate);
    if (existing) return { ...planAddition(existing, "ENTRY", command.quantity, today), lotCreated: false };

    assertNewLotExpiry(command.expiryDate, today);
    const lot = await tx.createLot(
      {
        productId: command.productId,
        lotNumber: command.lotNumber,
        expiryDate: command.expiryDate,
        quantity: command.quantity,
        unitCost: command.unitCost,
        supplierId: command.supplierId,
        invoiceNumber: command.invoiceNumber,
        location: command.location,
        notes: command.notes,
      },
      at,
    );
    // The new lot already holds the entered units; only the movement remains to be recorded.
    return {
      updates: [],
      movements: [{ type: "ENTRY", lotId: lot.id, quantity: command.quantity, balanceAfter: command.quantity }],
      lotCreated: true,
    };
  }

  async function plan(tx: StockTx, command: MovementCommand, today: CalendarDate, at: Date): Promise<MovementPlan & { lotCreated?: boolean }> {
    if (command.type === "ENTRY") return planEntry(tx, command, today, at);

    const lots = await tx.listLots(command.productId);
    switch (command.type) {
      case "EXIT":
        return planExit(lots, command.quantity, today, command.lotId);
      case "ADJUSTMENT_IN":
        return planAddition(lotOf(lots, command.lotId), "ADJUSTMENT_IN", command.quantity, today);
      case "ADJUSTMENT_OUT":
      case "WRITE_OFF":
      case "RETURN":
        return planRemoval(lotOf(lots, command.lotId), command.type, command.quantity, today);
      case "BLOCK":
        return planBlock(lotOf(lots, command.lotId), command.mode, command.quantity ?? 0, today);
      case "UNBLOCK":
        return planUnblock(lotOf(lots, command.lotId), command.mode, command.quantity ?? 0, today);
    }
  }

  async function registerMovement(actor: AuthUser, command: MovementCommand, ip?: string): Promise<MovementResult> {
    assertPermission(actor, permissionFor(command.type));
    const at = now();
    const today = todayInTz(at);

    const { movements, lotCreated, reasonId, reasonText } = await uow.run(async (tx) => {
      // Serializes every operation on this product; lots are read only after the lock is held.
      const product = await tx.lockProduct(command.productId);
      if (!product) throw new NotFoundError("product");
      if (command.type === "ENTRY" || command.type === "ADJUSTMENT_IN") assertCanReceiveStock(product);

      const reason = await resolveReason(tx, command);
      const planned = await plan(tx, command, today, at);
      await tx.updateLots(planned.updates);
      const refs = await tx.addMovements(
        planned.movements.map((movement) => ({
          ...movement,
          productId: command.productId,
          ...reason,
          userId: actor.id,
          occurredAt: at,
        })),
      );
      return { movements: refs, lotCreated: planned.lotCreated ?? false, ...reason };
    });

    // Outside the transaction: a failure here must never roll back (or fail) the committed movement.
    try {
      await alerts.evaluate(command.productId, today);
    } catch (error) {
      onAlertError(error);
    }

    await audit({
      actorId: actor.id,
      action: `stock.${command.type.toLowerCase()}`,
      entityType: "product",
      entityId: command.productId,
      after: {
        movements,
        reasonId,
        reasonText,
        ...(command.type === "ENTRY" ? { lotNumber: command.lotNumber, expiryDate: command.expiryDate, lotCreated } : {}),
      },
      ip,
    });
    return { productId: command.productId, movements };
  }

  return { registerMovement };
}

export type StockOperations = ReturnType<typeof createStockOperations>;
