import type { Lot } from "@/generated/prisma/client";
import { type CalendarDate, fromDbDate, toDbDate } from "@/shared/domain/dates";
import type { DbClient, TransactionRunner } from "@/shared/infrastructure/db/types";
import type { LotState } from "../domain/lot";
import type { PlannedLotUpdate } from "../domain/movement-rules";
import type {
  CountLineRecord,
  CountRecord,
  CountScope,
  LockedProduct,
  MovementRef,
  NewLotData,
  NewMovementData,
  ReasonRecord,
  StockTx,
  StockUnitOfWork,
} from "../application/ports";

export function toLotState(row: Lot): LotState {
  return {
    id: row.id,
    productId: row.productId,
    lotNumber: row.lotNumber,
    expiryDate: fromDbDate(row.expiryDate),
    receivedAt: row.receivedAt,
    currentQuantity: row.currentQuantity,
    blockedQuantity: row.blockedQuantity,
    status: row.status,
  };
}

class PrismaStockTx implements StockTx {
  constructor(private readonly tx: DbClient) {}

  async lockProduct(productId: string): Promise<LockedProduct | null> {
    // FOR NO KEY UPDATE conflicts with itself (serializing stock operations per product) but not with
    // the FOR KEY SHARE locks that foreign-key inserts take, so unrelated writers are not blocked.
    const rows = await this.tx.$queryRaw<Array<{ id: string; status: LockedProduct["status"]; commercial_name: string }>>`
      SELECT id::text AS id, status::text AS status, commercial_name
      FROM products
      WHERE id = ${productId}::uuid
      FOR NO KEY UPDATE`;
    const row = rows[0];
    return row ? { id: row.id, status: row.status, commercialName: row.commercial_name } : null;
  }

  async findLot(lotId: string) {
    const row = await this.tx.lot.findUnique({ where: { id: lotId } });
    return row ? toLotState(row) : null;
  }

  async listLots(productId: string) {
    return (await this.tx.lot.findMany({ where: { productId } })).map(toLotState);
  }

  async findLotByKey(productId: string, lotNumber: string, expiryDate: CalendarDate) {
    const row = await this.tx.lot.findUnique({
      where: { productId_lotNumber_expiryDate: { productId, lotNumber, expiryDate: toDbDate(expiryDate) } },
    });
    return row ? toLotState(row) : null;
  }

  async createLot(data: NewLotData, receivedAt: Date) {
    const row = await this.tx.lot.create({
      data: {
        productId: data.productId,
        lotNumber: data.lotNumber,
        expiryDate: toDbDate(data.expiryDate),
        initialQuantity: data.quantity,
        currentQuantity: data.quantity,
        receivedAt,
        unitCost: data.unitCost,
        supplierId: data.supplierId,
        invoiceNumber: data.invoiceNumber,
        location: data.location,
        notes: data.notes,
        status: "AVAILABLE",
      },
    });
    return toLotState(row);
  }

  async updateLots(updates: readonly PlannedLotUpdate[]) {
    for (const update of updates) {
      await this.tx.lot.update({
        where: { id: update.lotId },
        data: { currentQuantity: update.currentQuantity, blockedQuantity: update.blockedQuantity, status: update.status },
      });
    }
  }

  async addMovements(movements: readonly NewMovementData[]): Promise<MovementRef[]> {
    const refs: MovementRef[] = [];
    for (const movement of movements) {
      const row = await this.tx.stockMovement.create({ data: movement });
      refs.push({ id: row.id, type: row.type, lotId: row.lotId, quantity: row.quantity, balanceAfter: row.balanceAfter });
    }
    return refs;
  }

  async findReason(id: string): Promise<ReasonRecord | null> {
    const row = await this.tx.adjustmentReason.findUnique({ where: { id } });
    return row ? { id: row.id, name: row.name, kind: row.kind, active: row.active } : null;
  }

  async lockCount(countId: string): Promise<CountRecord | null> {
    const rows = await this.tx.$queryRaw<
      Array<{ id: string; status: CountRecord["status"]; created_by_id: string; notes: string | null; closed_at: Date | null }>
    >`
      SELECT id::text AS id, status::text AS status, created_by_id::text AS created_by_id, notes, closed_at
      FROM stock_counts
      WHERE id = ${countId}::uuid
      FOR UPDATE`;
    const row = rows[0];
    return row ? { id: row.id, status: row.status, createdById: row.created_by_id, notes: row.notes, closedAt: row.closed_at } : null;
  }

  async listLotsForCount(scope: CountScope) {
    const location = scope.location ? { contains: scope.location, mode: "insensitive" as const } : null;
    const [rows, category] = await Promise.all([
      this.tx.lot.findMany({
        where: {
          currentQuantity: { gt: 0 },
          ...(scope.categoryId ? { product: { categoryId: scope.categoryId } } : {}),
          ...(location ? { OR: [{ location }, { location: null, product: { location } }] } : {}),
        },
        orderBy: [{ product: { commercialName: "asc" } }, { expiryDate: "asc" }, { lotNumber: "asc" }],
      }),
      scope.categoryId ? this.tx.category.findUnique({ where: { id: scope.categoryId } }) : null,
    ]);
    return { lots: rows.map(toLotState), categoryName: category?.name ?? null };
  }

  async createCount(data: { createdById: string; notes: string | null }, lines: ReadonlyArray<{ lot: LotState }>): Promise<CountRecord> {
    const count = await this.tx.stockCount.create({ data });
    await this.tx.stockCountLine.createMany({
      data: lines.map(({ lot }) => ({
        stockCountId: count.id,
        lotId: lot.id,
        productId: lot.productId,
        expectedQuantity: lot.currentQuantity,
      })),
    });
    return { id: count.id, status: count.status, createdById: count.createdById, notes: count.notes, closedAt: count.closedAt };
  }

  async listCountLines(countId: string): Promise<CountLineRecord[]> {
    const rows = await this.tx.stockCountLine.findMany({ where: { stockCountId: countId } });
    return rows.map((row) => ({
      id: row.id,
      lotId: row.lotId,
      productId: row.productId,
      expectedQuantity: row.expectedQuantity,
      countedQuantity: row.countedQuantity,
      difference: row.difference,
      reconciled: row.reconciled,
    }));
  }

  async setCountedQuantity(lineId: string, countedQuantity: number | null, difference: number | null) {
    await this.tx.stockCountLine.update({ where: { id: lineId }, data: { countedQuantity, difference } });
  }

  async reconcileCountLine(lineId: string, difference: number) {
    await this.tx.stockCountLine.update({ where: { id: lineId }, data: { difference, reconciled: true } });
  }

  async closeCount(countId: string, closedAt: Date) {
    await this.tx.stockCount.update({ where: { id: countId }, data: { status: "CLOSED", closedAt } });
  }
}

export class PrismaStockUnitOfWork implements StockUnitOfWork {
  constructor(private readonly transact: TransactionRunner) {}

  run<T>(work: (tx: StockTx) => Promise<T>): Promise<T> {
    return this.transact((tx) => work(new PrismaStockTx(tx)));
  }
}
