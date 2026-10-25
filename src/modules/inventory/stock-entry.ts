import type { CalendarDate } from "@/shared/domain/dates";
import type { DbClient } from "@/shared/infrastructure/db/types";
import { applyEntry } from "./application/stock-operations";
import { createPrismaStockTx } from "./infrastructure/prisma-stock-tx";

export interface StockEntryRequest {
  actorId: string;
  productId: string;
  lotNumber: string;
  expiryDate: CalendarDate;
  quantity: number;
  unitCost: string;
  supplierId: string;
  invoiceNumber: string | null;
  receiptId: string;
  receiptLineId: string;
  at: Date;
  today: CalendarDate;
}

/**
 * Published entry point for other modules (goods receiving): enters units into stock inside the caller's
 * transaction, with the inventory module's own rules (FEFO lots, no expired new lots, no archived products)
 * and a movement that references the receipt. Never duplicate stock logic elsewhere: call this.
 */
export async function enterStock(db: DbClient, request: StockEntryRequest) {
  const result = await applyEntry(createPrismaStockTx(db), {
    actorId: request.actorId,
    entry: {
      productId: request.productId,
      quantity: request.quantity,
      lotNumber: request.lotNumber,
      expiryDate: request.expiryDate,
      unitCost: request.unitCost,
      supplierId: request.supplierId,
      invoiceNumber: request.invoiceNumber,
      location: null,
      notes: null,
    },
    today: request.today,
    at: request.at,
    reference: { type: "receipt", id: request.receiptId },
    receiptLineId: request.receiptLineId,
  });
  return { lotId: result.lotId, lotCreated: result.lotCreated, movementIds: result.movements.map((movement) => movement.id) };
}
