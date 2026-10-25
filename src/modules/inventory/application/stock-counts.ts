import type { RecordAudit } from "@/modules/audit/application/record-audit";
import { type AuthUser, assertPermission } from "@/modules/auth/domain/permissions";
import { todayInTz } from "@/shared/domain/dates";
import { ConflictError, NotFoundError, ValidationError } from "@/shared/domain/errors";
import { planCountCorrection, provisionalDifference } from "../domain/stock-count";
import { MAX_COUNTED_QUANTITY, type CountEntry } from "./count-input";
import type { CountScope, StockLevelAlerts, StockUnitOfWork } from "./ports";

export interface StockCountsDeps {
  uow: StockUnitOfWork;
  alerts: StockLevelAlerts;
  audit: RecordAudit;
  now?: () => Date;
  onAlertError?: (error: unknown) => void;
}

export interface CloseCountInput {
  reasonId: string | null;
  reasonText: string | null;
}

export interface CloseCountResult {
  countId: string;
  /** Lots that needed a compensating movement. */
  corrected: number;
  /** Counted lots that already matched. */
  unchanged: number;
  /** Lots nobody counted: left as they are. */
  uncounted: number;
  unitsAdded: number;
  unitsRemoved: number;
}

const CLOSED_MESSAGE = "El conteo ya está cerrado y no se puede modificar.";

/**
 * Physical counts: open (snapshot of the lots), enter counted quantities, close (reconcile).
 * Closing is ONE transaction that writes the compensating COUNT_CORRECTION_IN/OUT movements and
 * marks the count closed; a second close finds it closed and fails with a conflict.
 */
export function createStockCounts({ uow, alerts, audit, now = () => new Date(), onAlertError = console.error }: StockCountsDeps) {
  async function openCount(actor: AuthUser, input: CountScope & { notes?: string | null }, ip?: string) {
    assertPermission(actor, "inventory.count");
    const scope: CountScope = { categoryId: input.categoryId ?? undefined, location: input.location ?? undefined };

    const { count, lines } = await uow.run(async (tx) => {
      const { lots, categoryName } = await tx.listLotsForCount(scope);
      if (lots.length === 0) {
        throw new ValidationError("No lots to count", { categoryId: ["No hay lotes con stock para contar con ese alcance."] });
      }
      const scopeText = [categoryName ? `Categoría: ${categoryName}` : null, scope.location ? `Ubicación: ${scope.location}` : null, input.notes]
        .filter(Boolean)
        .join(" · ");
      const created = await tx.createCount({ createdById: actor.id, notes: scopeText || null }, lots.map((lot) => ({ lot })));
      return { count: created, lines: lots.length };
    });

    await audit({
      actorId: actor.id,
      action: "stock_count.open",
      entityType: "stock_count",
      entityId: count.id,
      after: { categoryId: scope.categoryId ?? null, location: scope.location ?? null, notes: count.notes, lines },
      ip,
    });
    return { id: count.id, lines };
  }

  /** Saves the counted quantity of the given lots (null clears one). Only changes are written. */
  async function saveCounts(actor: AuthUser, countId: string, entries: readonly CountEntry[], ip?: string) {
    assertPermission(actor, "inventory.count");
    for (const entry of entries) {
      const counted = entry.countedQuantity;
      if (counted !== null && (!Number.isInteger(counted) || counted < 0 || counted > MAX_COUNTED_QUANTITY)) {
        throw new ValidationError("Invalid counted quantity", { [`counted:${entry.lotId}`]: ["Ingresá un número entero mayor o igual a 0."] });
      }
    }

    const changes = await uow.run(async (tx) => {
      const count = await tx.lockCount(countId);
      if (!count) throw new NotFoundError("stock count");
      if (count.status === "CLOSED") throw new ConflictError("Stock count is closed", CLOSED_MESSAGE);

      const lines = new Map((await tx.listCountLines(countId)).map((line) => [line.lotId, line]));
      const applied: Array<{ lotId: string; before: number | null; after: number | null }> = [];
      for (const entry of entries) {
        const line = lines.get(entry.lotId);
        if (!line) throw new ValidationError("Lot not in count", { [`counted:${entry.lotId}`]: ["Ese lote no pertenece al conteo."] });
        if (line.countedQuantity === entry.countedQuantity) continue;
        await tx.setCountedQuantity(line.id, entry.countedQuantity, provisionalDifference(line.expectedQuantity, entry.countedQuantity));
        applied.push({ lotId: entry.lotId, before: line.countedQuantity, after: entry.countedQuantity });
      }
      return applied;
    });

    if (changes.length > 0) {
      await audit({ actorId: actor.id, action: "stock_count.save", entityType: "stock_count", entityId: countId, after: { changes }, ip });
    }
    return { saved: changes.length };
  }

  async function closeCount(actor: AuthUser, countId: string, input: CloseCountInput, ip?: string): Promise<CloseCountResult> {
    // Reconciliation adjusts stock, so it needs both the count permission and the adjust (write) one.
    assertPermission(actor, "inventory.count");
    assertPermission(actor, "inventory.write");
    const reasonText = input.reasonText?.trim() || null;
    if (!input.reasonId && !reasonText) {
      throw new ValidationError("Reason required", { reasonId: ["Elegí un motivo o escribí el detalle: es obligatorio para cerrar el conteo."] });
    }
    const at = now();
    const today = todayInTz(at);

    const outcome = await uow.run(async (tx) => {
      // The count row lock makes a concurrent second close wait, then see CLOSED and fail.
      const count = await tx.lockCount(countId);
      if (!count) throw new NotFoundError("stock count");
      if (count.status === "CLOSED") throw new ConflictError("Stock count already closed", "El conteo ya fue cerrado.");

      if (input.reasonId) {
        const reason = await tx.findReason(input.reasonId);
        if (!reason || !reason.active || reason.kind !== "ADJUSTMENT") {
          throw new ValidationError("Invalid reason", { reasonId: ["El motivo elegido no es válido para un conteo."] });
        }
      }

      const lines = await tx.listCountLines(countId);
      const counted = lines.filter((line) => line.countedQuantity !== null && !line.reconciled);

      // Lock every affected product in a fixed order (no deadlocks with other stock operations),
      // then read the lots: corrections are computed against their current quantities.
      const productIds = [...new Set(counted.map((line) => line.productId))].sort();
      for (const productId of productIds) await tx.lockProduct(productId);

      const result = { corrected: 0, unchanged: 0, unitsAdded: 0, unitsRemoved: 0, movements: [] as Array<{ lotId: string; type: string; quantity: number }> };
      for (const line of counted) {
        const lot = await tx.findLot(line.lotId);
        if (!lot) throw new NotFoundError("lot");
        const { difference, plan } = planCountCorrection(lot, line.countedQuantity as number, today);
        if (plan) {
          await tx.updateLots(plan.updates);
          await tx.addMovements(
            plan.movements.map((movement) => ({
              ...movement,
              productId: line.productId,
              reasonId: input.reasonId,
              reasonText,
              userId: actor.id,
              occurredAt: at,
              referenceType: "stock_count",
              referenceId: countId,
            })),
          );
          result.corrected += 1;
          if (difference > 0) result.unitsAdded += difference;
          else result.unitsRemoved += -difference;
          result.movements.push({ lotId: line.lotId, type: plan.movements[0].type, quantity: plan.movements[0].quantity });
        } else {
          result.unchanged += 1;
        }
        await tx.reconcileCountLine(line.id, difference);
      }
      await tx.closeCount(countId, at);
      return { ...result, uncounted: lines.filter((line) => line.countedQuantity === null).length, productIds };
    });

    // After the commit: alert failures must never undo the reconciliation.
    for (const productId of outcome.productIds) {
      try {
        await alerts.evaluate(productId, today);
      } catch (error) {
        onAlertError(error);
      }
    }

    await audit({
      actorId: actor.id,
      action: "stock_count.close",
      entityType: "stock_count",
      entityId: countId,
      after: {
        reasonId: input.reasonId,
        reasonText,
        corrected: outcome.corrected,
        unchanged: outcome.unchanged,
        uncounted: outcome.uncounted,
        unitsAdded: outcome.unitsAdded,
        unitsRemoved: outcome.unitsRemoved,
        movements: outcome.movements,
      },
      ip,
    });
    return {
      countId,
      corrected: outcome.corrected,
      unchanged: outcome.unchanged,
      uncounted: outcome.uncounted,
      unitsAdded: outcome.unitsAdded,
      unitsRemoved: outcome.unitsRemoved,
    };
  }

  return { openCount, saveCounts, closeCount };
}

export type StockCounts = ReturnType<typeof createStockCounts>;
