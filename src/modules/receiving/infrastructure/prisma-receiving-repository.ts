import type { Prisma } from "@/generated/prisma/client";
import { addDays, fromDbDate, startOfDayInTz, toDbDate } from "@/shared/domain/dates";
import type { DbClient, TransactionRunner } from "@/shared/infrastructure/db/types";
import { enterStock } from "@/modules/inventory/stock-entry";
import type {
  DeliveryForReceiving,
  ExpectedProductView,
  Page,
  ReceiptContent,
  ReceiptLineRecord,
  ReceiptListQuery,
  ReceiptMovementView,
  ReceiptRecord,
  ReceiptSummary,
  ReceivingReadRepository,
  ReceivingTx,
  ReceivingUnitOfWork,
  StockEntryRequest,
  SupplierOption,
} from "../application/ports";

const lineInclude = {
  product: { select: { code: true, commercialName: true, barcode: true, unit: { select: { name: true } } } },
} satisfies Prisma.ReceiptLineInclude;

// Lines come back in a stable, readable order (rows inserted in one transaction share the same created_at).
const lineOrderBy: Prisma.ReceiptLineOrderByWithRelationInput[] = [
  { product: { commercialName: "asc" } },
  { lotNumber: "asc" },
  { expiryDate: "asc" },
  { id: "asc" },
];

const recordInclude = {
  delivery: { select: { scheduledAt: true, type: true } },
  supplier: { select: { name: true } },
  confirmedBy: { select: { name: true } },
  lines: { include: lineInclude, orderBy: lineOrderBy },
  issues: { include: { product: { select: { commercialName: true } } }, orderBy: [{ type: "asc" }, { id: "asc" }] },
} satisfies Prisma.ReceiptInclude;
type ReceiptWithRelations = Prisma.ReceiptGetPayload<{ include: typeof recordInclude }>;
type LineWithProduct = Prisma.ReceiptLineGetPayload<{ include: typeof lineInclude }>;

function toLineRecord(row: LineWithProduct): ReceiptLineRecord {
  return {
    id: row.id,
    productId: row.productId,
    productCode: row.product.code,
    productName: row.product.commercialName,
    barcode: row.product.barcode,
    unitName: row.product.unit.name,
    lotNumber: row.lotNumber,
    expiryDate: fromDbDate(row.expiryDate),
    quantity: row.quantity,
    damagedQuantity: row.damagedQuantity,
    unitCost: row.unitCost.toFixed(2),
  };
}

function toRecord(row: ReceiptWithRelations): ReceiptRecord {
  return {
    id: row.id,
    deliveryId: row.deliveryId,
    deliveryScheduledAt: row.delivery?.scheduledAt ?? null,
    deliveryType: row.delivery?.type ?? null,
    supplierId: row.supplierId,
    supplierName: row.supplier.name,
    invoiceNumber: row.invoiceNumber,
    status: row.status,
    isPartial: row.isPartial,
    idempotencyKey: row.idempotencyKey,
    confirmedById: row.confirmedById,
    confirmedByName: row.confirmedBy?.name ?? null,
    confirmedAt: row.confirmedAt,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lines: row.lines.map(toLineRecord),
    issues: row.issues.map((issue) => ({
      id: issue.id,
      type: issue.type,
      productId: issue.productId,
      productName: issue.product?.commercialName ?? null,
      quantity: issue.quantity,
      description: issue.description,
    })),
  };
}

const summaryInclude = {
  supplier: { select: { name: true } },
  _count: { select: { lines: true, issues: true } },
} satisfies Prisma.ReceiptInclude;

function toSummary(row: Prisma.ReceiptGetPayload<{ include: typeof summaryInclude }>): ReceiptSummary {
  return {
    id: row.id,
    deliveryId: row.deliveryId,
    supplierId: row.supplierId,
    supplierName: row.supplier.name,
    invoiceNumber: row.invoiceNumber,
    status: row.status,
    isPartial: row.isPartial,
    createdAt: row.createdAt,
    confirmedAt: row.confirmedAt,
    lineCount: row._count.lines,
    issueCount: row._count.issues,
  };
}

function buildWhere(query: ReceiptListQuery): Prisma.ReceiptWhereInput {
  const and: Prisma.ReceiptWhereInput[] = [];
  if (query.supplierId) and.push({ supplierId: query.supplierId });
  if (query.status) and.push({ status: query.status });
  if (query.withIssues) and.push({ issues: { some: {} } });
  if (query.from || query.to) {
    // The receipt date is its confirmation; a draft has none yet, so its creation date stands in.
    const range: Prisma.DateTimeFilter = {};
    if (query.from) range.gte = startOfDayInTz(query.from);
    if (query.to) range.lt = startOfDayInTz(addDays(query.to, 1));
    and.push({ OR: [{ confirmedAt: range }, { confirmedAt: null, createdAt: range }] });
  }
  return { AND: and };
}

export class PrismaReceivingReadRepository implements ReceivingReadRepository {
  constructor(private readonly db: DbClient) {}

  async findById(id: string) {
    const row = await this.db.receipt.findUnique({ where: { id }, include: recordInclude });
    return row ? toRecord(row) : null;
  }

  async list(query: ReceiptListQuery): Promise<Page<ReceiptSummary>> {
    const where = buildWhere(query);
    const [total, rows] = await Promise.all([
      this.db.receipt.count({ where }),
      this.db.receipt.findMany({
        where,
        include: summaryInclude,
        // Drafts (no confirmation yet) first when newest-first, then by creation; `id` keeps pages stable.
        orderBy: [{ confirmedAt: { sort: query.dir, nulls: query.dir === "desc" ? "first" : "last" } }, { createdAt: query.dir }, { id: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { items: rows.map(toSummary), total };
  }

  async expectedProducts(deliveryId: string, excludeReceiptId?: string): Promise<ExpectedProductView[]> {
    const [items, received] = await Promise.all([
      this.db.deliveryExpectedItem.findMany({
        where: { deliveryId },
        include: { product: { select: { code: true, commercialName: true, barcode: true, unit: { select: { name: true } } } } },
        orderBy: [{ product: { commercialName: "asc" } }, { productId: "asc" }],
      }),
      this.db.receiptLine.groupBy({
        by: ["productId"],
        where: { receipt: { deliveryId, status: "CONFIRMED", ...(excludeReceiptId ? { id: { not: excludeReceiptId } } : {}) } },
        _sum: { quantity: true },
      }),
    ]);
    const receivedBy = new Map(received.map((row) => [row.productId, row._sum.quantity ?? 0]));
    return items.map((item) => {
      const alreadyReceived = receivedBy.get(item.productId) ?? 0;
      return {
        productId: item.productId,
        productCode: item.product.code,
        productName: item.product.commercialName,
        barcode: item.product.barcode,
        unitName: item.product.unit.name,
        expected: item.expectedQuantity,
        alreadyReceived,
        pending: Math.max(0, item.expectedQuantity - alreadyReceived),
      };
    });
  }

  async listMovements(receiptId: string): Promise<ReceiptMovementView[]> {
    const rows = await this.db.stockMovement.findMany({
      where: { referenceType: "receipt", referenceId: receiptId },
      include: { product: { select: { commercialName: true } }, lot: { select: { lotNumber: true } } },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      productId: row.productId,
      productName: row.product.commercialName,
      lotNumber: row.lot.lotNumber,
      quantity: row.quantity,
      balanceAfter: row.balanceAfter,
      occurredAt: row.occurredAt,
    }));
  }

  async listForDelivery(deliveryId: string) {
    const rows = await this.db.receipt.findMany({ where: { deliveryId }, include: summaryInclude, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    return rows.map(toSummary);
  }

  async listRecentForSupplier(supplierId: string, limit: number) {
    const rows = await this.db.receipt.findMany({
      where: { supplierId },
      include: summaryInclude,
      orderBy: [{ confirmedAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }, { id: "asc" }],
      take: limit,
    });
    return rows.map(toSummary);
  }

  async listSupplierOptions(): Promise<SupplierOption[]> {
    return this.db.supplier.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  }
}

class PrismaReceivingTx implements ReceivingTx {
  constructor(private readonly tx: DbClient) {}

  async lockReceipt(id: string) {
    const rows = await this.tx.$queryRaw<Array<{ id: string }>>`SELECT id::text AS id FROM receipts WHERE id = ${id}::uuid FOR UPDATE`;
    if (rows.length === 0) return null;
    const row = await this.tx.receipt.findUnique({ where: { id }, include: recordInclude });
    return row ? toRecord(row) : null;
  }

  async lockDelivery(id: string): Promise<DeliveryForReceiving | null> {
    const rows = await this.tx.$queryRaw<Array<{ id: string; supplier_id: string; type: DeliveryForReceiving["type"]; status: DeliveryForReceiving["status"] }>>`
      SELECT id::text AS id, supplier_id::text AS supplier_id, type::text AS type, status::text AS status
      FROM scheduled_deliveries
      WHERE id = ${id}::uuid
      FOR UPDATE`;
    const row = rows[0];
    return row ? { id: row.id, supplierId: row.supplier_id, type: row.type, status: row.status } : null;
  }

  async findOpenDraftForDelivery(deliveryId: string) {
    const row = await this.tx.receipt.findFirst({ where: { deliveryId, status: "DRAFT" }, orderBy: { createdAt: "asc" }, select: { id: true } });
    return row?.id ?? null;
  }

  async createDraft(data: { supplierId: string; deliveryId: string | null; idempotencyKey: string }) {
    const row = await this.tx.receipt.create({
      data: { supplierId: data.supplierId, deliveryId: data.deliveryId, idempotencyKey: data.idempotencyKey },
      select: { id: true },
    });
    return row.id;
  }

  async replaceContent(receiptId: string, content: ReceiptContent) {
    await this.tx.receiptLine.deleteMany({ where: { receiptId } });
    await this.tx.receiptIssue.deleteMany({ where: { receiptId } });
    for (const line of content.lines) {
      await this.tx.receiptLine.create({
        data: {
          receiptId,
          productId: line.productId,
          lotNumber: line.lotNumber,
          expiryDate: toDbDate(line.expiryDate),
          quantity: line.quantity,
          damagedQuantity: line.damagedQuantity,
          unitCost: line.unitCost,
        },
      });
    }
    if (content.manualIssues.length > 0) {
      await this.tx.receiptIssue.createMany({
        data: content.manualIssues.map((issue) => ({
          receiptId,
          type: issue.type,
          productId: issue.productId,
          quantity: issue.quantity,
          description: issue.description,
        })),
      });
    }
    await this.tx.receipt.update({
      where: { id: receiptId },
      data: { invoiceNumber: content.invoiceNumber, notes: content.notes, isPartial: content.isPartial },
    });
    const rows = await this.tx.receiptLine.findMany({ where: { receiptId }, include: lineInclude, orderBy: lineOrderBy });
    return rows.map(toLineRecord);
  }

  async deliveryExpected(deliveryId: string) {
    return this.tx.deliveryExpectedItem.findMany({ where: { deliveryId }, select: { productId: true, expectedQuantity: true } });
  }

  async receivedSoFar(deliveryId: string, excludeReceiptId: string) {
    const rows = await this.tx.receiptLine.groupBy({
      by: ["productId"],
      where: { receipt: { deliveryId, status: "CONFIRMED", id: { not: excludeReceiptId } } },
      _sum: { quantity: true },
    });
    return new Map(rows.map((row) => [row.productId, row._sum.quantity ?? 0]));
  }

  async setDeliveryStatus(id: string, status: DeliveryForReceiving["status"]) {
    await this.tx.scheduledDelivery.update({ where: { id }, data: { status } });
  }

  async supplierStatus(id: string) {
    return (await this.tx.supplier.findUnique({ where: { id }, select: { status: true } }))?.status ?? null;
  }

  async productStatuses(ids: readonly string[]) {
    const rows = await this.tx.product.findMany({ where: { id: { in: [...ids] } }, select: { id: true, status: true } });
    return new Map(rows.map((row) => [row.id, row.status]));
  }

  enterStock(request: StockEntryRequest) {
    // The inventory module's own entry rules (lot creation or addition, expiry, archived products) run in THIS transaction.
    return enterStock(this.tx, request);
  }

  async markConfirmed(
    receiptId: string,
    data: { confirmedById: string; confirmedAt: Date; isPartial: boolean; issues: Array<{ type: string; productId: string | null; quantity: number | null; description?: string }> },
  ) {
    await this.tx.receiptIssue.deleteMany({ where: { receiptId } });
    if (data.issues.length > 0) {
      await this.tx.receiptIssue.createMany({
        data: data.issues.map((issue) => ({
          receiptId,
          type: issue.type as Prisma.ReceiptIssueCreateManyInput["type"],
          productId: issue.productId,
          quantity: issue.quantity,
          description: issue.description ?? null,
        })),
      });
    }
    await this.tx.receipt.update({
      where: { id: receiptId },
      data: { status: "CONFIRMED", confirmedById: data.confirmedById, confirmedAt: data.confirmedAt, isPartial: data.isPartial },
    });
  }

  async deleteDraft(receiptId: string) {
    await this.tx.receipt.delete({ where: { id: receiptId } });
  }
}

export class PrismaReceivingUnitOfWork implements ReceivingUnitOfWork {
  constructor(private readonly transact: TransactionRunner) {}

  run<T>(work: (tx: ReceivingTx) => Promise<T>): Promise<T> {
    return this.transact((tx) => work(new PrismaReceivingTx(tx)));
  }
}
