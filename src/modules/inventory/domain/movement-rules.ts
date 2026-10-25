import type { CalendarDate } from "@/shared/domain/dates";
import { ValidationError } from "@/shared/domain/errors";
import { ExpiredLotError, InsufficientStockError, LotNotUsableError } from "./errors";
import { allocateFefo, toFefoCandidates } from "./fefo";
import { type LotState, type LotStatus, effectiveLotStatus, isExpired, usableQuantity } from "./lot";
import { type CountCorrectionType, type MovementType, allowedOnExpiredLot } from "./movement-type";

/**
 * Pure planning of stock operations: given the current state of the lots, decide the new
 * state and the movements to append, or throw a domain error. No I/O: the application layer
 * locks the product, loads the lots, calls a planner and persists the plan in one transaction.
 */

export const MAX_MOVEMENT_QUANTITY = 1_000_000;

export interface PlannedLotUpdate {
  lotId: string;
  currentQuantity: number;
  blockedQuantity: number;
  status: LotStatus;
}

export interface PlannedMovement {
  type: MovementType;
  lotId: string;
  /** Always positive; the direction comes from the type. */
  quantity: number;
  /** Physical quantity of the lot after the movement. */
  balanceAfter: number;
}

export interface MovementPlan {
  updates: PlannedLotUpdate[];
  movements: PlannedMovement[];
}

export type { CountCorrectionType };

export type BlockMode = "UNITS" | "QUARANTINE" | "BLOCKED";
export type UnblockMode = "UNITS" | "LOT";

export function assertValidQuantity(quantity: number): void {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_MOVEMENT_QUANTITY) {
    throw new ValidationError("Invalid quantity", {
      quantity: [`Ingresá una cantidad entera entre 1 y ${MAX_MOVEMENT_QUANTITY.toLocaleString("es-AR")}.`],
    });
  }
}

/** Expired lots only accept write-off, return and count corrections. */
export function assertAllowedOnLot(type: MovementType, lot: LotState, today: CalendarDate): void {
  if (effectiveLotStatus(lot, today) === "EXPIRED" && !allowedOnExpiredLot(type)) throw new ExpiredLotError(lot.lotNumber);
}

/** A lot that reaches zero is DEPLETED; a depleted lot that receives stock is AVAILABLE again. */
export function statusAfter(previous: LotStatus, currentQuantity: number): LotStatus {
  if (currentQuantity === 0) return "DEPLETED";
  return previous === "DEPLETED" ? "AVAILABLE" : previous;
}

function update(lot: LotState, changes: Partial<Pick<PlannedLotUpdate, "currentQuantity" | "blockedQuantity" | "status">>): PlannedLotUpdate {
  return {
    lotId: lot.id,
    currentQuantity: lot.currentQuantity,
    blockedQuantity: lot.blockedQuantity,
    status: lot.status,
    ...changes,
  };
}

function requireLot(lots: readonly LotState[], lotId: string): LotState {
  const lot = lots.find((candidate) => candidate.id === lotId);
  if (!lot) throw new ValidationError("Lot not found for product", { lotId: ["El lote elegido no pertenece al producto."] });
  return lot;
}

function notDispensable(lot: LotState, today: CalendarDate): never {
  const status = effectiveLotStatus(lot, today);
  if (status === "EXPIRED") throw new ExpiredLotError(lot.lotNumber);
  const reasons: Record<string, string> = {
    QUARANTINE: `El lote ${lot.lotNumber} está en cuarentena y no se puede usar.`,
    BLOCKED: `El lote ${lot.lotNumber} está bloqueado y no se puede usar.`,
    DEPLETED: `El lote ${lot.lotNumber} está agotado.`,
  };
  throw new LotNotUsableError(reasons[status] ?? `El lote ${lot.lotNumber} no se puede usar.`);
}

/**
 * Normal exit (dispensing). Default: FEFO over the usable lots of the product. With `lotId`, the
 * user chose a specific lot, which must itself be usable. Never takes blocked or expired units.
 */
export function planExit(lots: readonly LotState[], quantity: number, today: CalendarDate, lotId?: string | null): MovementPlan {
  assertValidQuantity(quantity);

  if (lotId) {
    const lot = requireLot(lots, lotId);
    if (effectiveLotStatus(lot, today) !== "AVAILABLE") notDispensable(lot, today);
    const available = usableQuantity(lot, today);
    if (quantity > available) throw new InsufficientStockError(available, quantity);
    return planExitFrom([{ lot, quantity }]);
  }

  const allocations = allocateFefo(toFefoCandidates(lots, today), quantity);
  return planExitFrom(allocations.map((allocation) => ({ lot: requireLot(lots, allocation.lotId), quantity: allocation.quantity })));
}

function planExitFrom(takes: Array<{ lot: LotState; quantity: number }>): MovementPlan {
  const plan: MovementPlan = { updates: [], movements: [] };
  for (const { lot, quantity } of takes) {
    const currentQuantity = lot.currentQuantity - quantity;
    plan.updates.push(update(lot, { currentQuantity, status: statusAfter(lot.status, currentQuantity) }));
    plan.movements.push({ type: "EXIT", lotId: lot.id, quantity, balanceAfter: currentQuantity });
  }
  return plan;
}

/**
 * Stock leaving the shelf for a stated reason: adjustment, write-off or return. These may take
 * blocked units too (a quarantined lot is often exactly what gets written off) but never more
 * than what is physically there; the blocked counter is clamped to what remains.
 */
export function planRemoval(
  lot: LotState,
  type: "ADJUSTMENT_OUT" | "WRITE_OFF" | "RETURN" | "COUNT_CORRECTION_OUT",
  quantity: number,
  today: CalendarDate,
): MovementPlan {
  assertValidQuantity(quantity);
  assertAllowedOnLot(type, lot, today);
  if (quantity > lot.currentQuantity) throw new InsufficientStockError(lot.currentQuantity, quantity);

  const currentQuantity = lot.currentQuantity - quantity;
  return {
    updates: [
      update(lot, {
        currentQuantity,
        blockedQuantity: Math.min(lot.blockedQuantity, currentQuantity),
        status: statusAfter(lot.status, currentQuantity),
      }),
    ],
    movements: [{ type, lotId: lot.id, quantity, balanceAfter: currentQuantity }],
  };
}

/** Adds units to an existing lot (an entry into a known lot, a positive adjustment or a count correction). */
export function planAddition(
  lot: LotState,
  type: "ENTRY" | "ADJUSTMENT_IN" | "COUNT_CORRECTION_IN",
  quantity: number,
  today: CalendarDate,
): MovementPlan {
  assertValidQuantity(quantity);
  assertAllowedOnLot(type, lot, today);
  const currentQuantity = lot.currentQuantity + quantity;
  return {
    updates: [update(lot, { currentQuantity, status: statusAfter(lot.status, currentQuantity) })],
    movements: [{ type, lotId: lot.id, quantity, balanceAfter: currentQuantity }],
  };
}

/** A new lot cannot be received already expired: that stock could only be written off. */
export function assertNewLotExpiry(expiryDate: CalendarDate, today: CalendarDate): void {
  if (isExpired(expiryDate, today)) {
    throw new ValidationError("Expiry date already passed", {
      expiryDate: ["La fecha de vencimiento ya pasó: no se puede ingresar un lote vencido."],
    });
  }
}

/** BLOCK: hold some units (UNITS) or the whole lot (QUARANTINE / BLOCKED). Never touches the physical quantity. */
export function planBlock(lot: LotState, mode: BlockMode, quantity: number, today: CalendarDate): MovementPlan {
  assertAllowedOnLot("BLOCK", lot, today);
  const status = effectiveLotStatus(lot, today);

  if (mode === "UNITS") {
    assertValidQuantity(quantity);
    if (status !== "AVAILABLE") {
      throw new LotNotUsableError(`El lote ${lot.lotNumber} ya no está disponible: no hay unidades para bloquear.`);
    }
    const free = lot.currentQuantity - lot.blockedQuantity;
    if (quantity > free) throw new InsufficientStockError(free, quantity);
    return {
      updates: [update(lot, { blockedQuantity: lot.blockedQuantity + quantity })],
      movements: [{ type: "BLOCK", lotId: lot.id, quantity, balanceAfter: lot.currentQuantity }],
    };
  }

  if (status !== "AVAILABLE") {
    const message =
      status === "DEPLETED" ? `El lote ${lot.lotNumber} está agotado.` : `El lote ${lot.lotNumber} ya está en cuarentena o bloqueado.`;
    throw new LotNotUsableError(message);
  }
  return {
    updates: [update(lot, { status: mode })],
    movements: [{ type: "BLOCK", lotId: lot.id, quantity: lot.currentQuantity, balanceAfter: lot.currentQuantity }],
  };
}

/** UNBLOCK: release held units (UNITS) or put a quarantined/blocked lot back in service (LOT). */
export function planUnblock(lot: LotState, mode: UnblockMode, quantity: number, today: CalendarDate): MovementPlan {
  assertAllowedOnLot("UNBLOCK", lot, today);

  if (mode === "UNITS") {
    assertValidQuantity(quantity);
    if (quantity > lot.blockedQuantity) {
      throw new InsufficientStockError(lot.blockedQuantity, quantity);
    }
    return {
      updates: [update(lot, { blockedQuantity: lot.blockedQuantity - quantity })],
      movements: [{ type: "UNBLOCK", lotId: lot.id, quantity, balanceAfter: lot.currentQuantity }],
    };
  }

  if (lot.status !== "QUARANTINE" && lot.status !== "BLOCKED") {
    throw new LotNotUsableError(`El lote ${lot.lotNumber} no está en cuarentena ni bloqueado.`);
  }
  return {
    updates: [update(lot, { status: "AVAILABLE" })],
    movements: [{ type: "UNBLOCK", lotId: lot.id, quantity: lot.currentQuantity, balanceAfter: lot.currentQuantity }],
  };
}
