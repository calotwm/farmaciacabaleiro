import { ConflictError } from "@/shared/domain/errors";

function units(count: number): string {
  return count === 1 ? "1 unidad" : `${count} unidades`;
}

/** Not enough usable stock: no negative stock and no override (accepted assumption 3). */
export class InsufficientStockError extends ConflictError {
  readonly available: number;
  readonly requested: number;

  constructor(available: number, requested: number) {
    const message = `Stock insuficiente: pediste ${units(requested)} y hay ${units(available)} disponibles.`;
    super("Insufficient stock", message, { quantity: [message] });
    this.available = available;
    this.requested = requested;
  }
}

/** An expired lot only allows write-off or return (accepted assumption 2). */
export class ExpiredLotError extends ConflictError {
  constructor(lotNumber: string) {
    const message = `El lote ${lotNumber} está vencido: solo se puede dar de baja o devolver al proveedor.`;
    super("Lot is expired", message, { lotId: [message] });
  }
}

/** The lot exists and is not expired, but its state does not allow the operation. */
export class LotNotUsableError extends ConflictError {
  constructor(message: string, field = "lotId") {
    super("Lot not usable", message, { [field]: [message] });
  }
}
