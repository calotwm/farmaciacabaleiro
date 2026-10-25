import type { Prisma } from "@/generated/prisma/client";
import { addDays, startOfDayInTz } from "@/shared/domain/dates";
import type { DbClient, TransactionRunner } from "@/shared/infrastructure/db/types";
import type { ComplianceRow } from "../domain/compliance";
import { OPEN_DELIVERY_STATUSES } from "../domain/delivery-status";
import type {
  CalendarQuery,
  ComplianceQuery,
  DeliveryData,
  DeliveryEditData,
  DeliveryListQuery,
  DeliveryReadRepository,
  DeliveryRecord,
  DeliverySummary,
  DeliveryTx,
  DeliveryUnitOfWork,
  Page,
  SupplierOption,
  UserOption,
} from "../application/ports";

const recordInclude = {
  supplier: { select: { name: true } },
  responsibleUser: { select: { name: true } },
  rescheduledTo: { select: { id: true }, orderBy: { createdAt: "desc" }, take: 1 },
  expectedItems: {
    include: { product: { select: { code: true, commercialName: true, unit: { select: { name: true } } } } },
    orderBy: [{ product: { commercialName: "asc" } }, { productId: "asc" }],
  },
} satisfies Prisma.ScheduledDeliveryInclude;
type DeliveryWithRelations = Prisma.ScheduledDeliveryGetPayload<{ include: typeof recordInclude }>;

const summaryInclude = {
  supplier: { select: { name: true } },
  responsibleUser: { select: { name: true } },
  _count: { select: { expectedItems: true } },
} satisfies Prisma.ScheduledDeliveryInclude;
type DeliveryWithCount = Prisma.ScheduledDeliveryGetPayload<{ include: typeof summaryInclude }>;

function toRecord(row: DeliveryWithRelations): DeliveryRecord {
  return {
    id: row.id,
    supplierId: row.supplierId,
    supplierName: row.supplier.name,
    scheduledAt: row.scheduledAt,
    type: row.type,
    status: row.status,
    orderNumber: row.orderNumber,
    responsibleUserId: row.responsibleUserId,
    responsibleUserName: row.responsibleUser?.name ?? null,
    notes: row.notes,
    rescheduledFromId: row.rescheduledFromId,
    rescheduledToId: row.rescheduledTo[0]?.id ?? null,
    expectedItems: row.expectedItems.map((item) => ({
      productId: item.productId,
      productCode: item.product.code,
      productName: item.product.commercialName,
      unitName: item.product.unit.name,
      expectedQuantity: item.expectedQuantity,
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toSummary(row: DeliveryWithCount): DeliverySummary {
  return {
    id: row.id,
    supplierId: row.supplierId,
    supplierName: row.supplier.name,
    scheduledAt: row.scheduledAt,
    type: row.type,
    status: row.status,
    orderNumber: row.orderNumber,
    responsibleUserName: row.responsibleUser?.name ?? null,
    expectedItemCount: row._count.expectedItems,
  };
}

function filterWhere(filters: { supplierId?: string; type?: string; status?: string }): Prisma.ScheduledDeliveryWhereInput[] {
  const and: Prisma.ScheduledDeliveryWhereInput[] = [];
  if (filters.supplierId) and.push({ supplierId: filters.supplierId });
  if (filters.type) and.push({ type: filters.type as Prisma.ScheduledDeliveryWhereInput["type"] });
  if (filters.status) and.push({ status: filters.status as Prisma.ScheduledDeliveryWhereInput["status"] });
  return and;
}

function buildListWhere(query: DeliveryListQuery): Prisma.ScheduledDeliveryWhereInput {
  const and = filterWhere(query);
  // Day bounds are AR midnights: `to` is inclusive, so the range ends at the start of the next day.
  if (query.from) and.push({ scheduledAt: { gte: startOfDayInTz(query.from) } });
  if (query.to) and.push({ scheduledAt: { lt: startOfDayInTz(addDays(query.to, 1)) } });
  if (query.lateOnly) and.push({ status: { in: [...OPEN_DELIVERY_STATUSES] }, scheduledAt: { lt: query.now } });
  return { AND: and };
}

function buildOrderBy(query: DeliveryListQuery): Prisma.ScheduledDeliveryOrderByWithRelationInput[] {
  const { dir } = query;
  const primary: Prisma.ScheduledDeliveryOrderByWithRelationInput =
    query.sort === "supplier"
      ? { supplier: { name: dir } }
      : query.sort === "type"
        ? { type: dir }
        : query.sort === "status"
          ? { status: dir }
          : { scheduledAt: dir };
  // `id` makes the order total so pagination is stable.
  return [primary, { id: "asc" }];
}

export class PrismaDeliveryReadRepository implements DeliveryReadRepository {
  constructor(private readonly db: DbClient) {}

  async findById(id: string) {
    const row = await this.db.scheduledDelivery.findUnique({ where: { id }, include: recordInclude });
    return row ? toRecord(row) : null;
  }

  async list(query: DeliveryListQuery): Promise<Page<DeliverySummary>> {
    const where = buildListWhere(query);
    const [total, rows] = await Promise.all([
      this.db.scheduledDelivery.count({ where }),
      this.db.scheduledDelivery.findMany({
        where,
        include: summaryInclude,
        orderBy: buildOrderBy(query),
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { items: rows.map(toSummary), total };
  }

  async listForCalendar(query: CalendarQuery) {
    const rows = await this.db.scheduledDelivery.findMany({
      where: {
        AND: [
          ...filterWhere(query),
          { scheduledAt: { gte: startOfDayInTz(query.from), lt: startOfDayInTz(query.toExclusive) } },
        ],
      },
      include: summaryInclude,
      orderBy: [{ scheduledAt: "asc" }, { id: "asc" }],
    });
    return rows.map(toSummary);
  }

  async listOpenForSupplier(supplierId: string, limit: number) {
    const rows = await this.db.scheduledDelivery.findMany({
      where: { supplierId, status: { in: [...OPEN_DELIVERY_STATUSES] } },
      include: summaryInclude,
      orderBy: [{ scheduledAt: "asc" }, { id: "asc" }],
      take: limit,
    });
    return rows.map(toSummary);
  }

  async listComplianceRows(query: ComplianceQuery): Promise<ComplianceRow[]> {
    const scheduledAt: Prisma.DateTimeFilter = {};
    if (query.from) scheduledAt.gte = startOfDayInTz(query.from);
    if (query.to) scheduledAt.lt = startOfDayInTz(addDays(query.to, 1));
    const rows = await this.db.scheduledDelivery.findMany({
      where: { type: "DELIVERY", ...(query.supplierId ? { supplierId: query.supplierId } : {}), ...(query.from || query.to ? { scheduledAt } : {}) },
      select: {
        supplierId: true,
        type: true,
        status: true,
        scheduledAt: true,
        // The latest confirmed receipt is the one that completed the delivery.
        receipts: { where: { status: "CONFIRMED" }, select: { confirmedAt: true }, orderBy: { confirmedAt: "desc" }, take: 1 },
      },
    });
    return rows.map((row) => ({
      supplierId: row.supplierId,
      type: row.type,
      status: row.status,
      scheduledAt: row.scheduledAt,
      receivedAt: row.receipts[0]?.confirmedAt ?? null,
    }));
  }

  async listSupplierOptions(): Promise<SupplierOption[]> {
    const rows = await this.db.supplier.findMany({ select: { id: true, name: true, status: true }, orderBy: { name: "asc" } });
    return rows.map((row) => ({ id: row.id, name: row.name, active: row.status === "ACTIVE" }));
  }

  async listUserOptions(): Promise<UserOption[]> {
    return this.db.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  }

  async supplierNames(ids: readonly string[]) {
    const rows = await this.db.supplier.findMany({ where: { id: { in: [...ids] } }, select: { id: true, name: true } });
    return new Map(rows.map((row) => [row.id, row.name]));
  }
}

class PrismaDeliveryTx implements DeliveryTx {
  constructor(private readonly tx: DbClient) {}

  async lock(id: string) {
    const rows = await this.tx.$queryRaw<Array<{ id: string }>>`
      SELECT id::text AS id FROM scheduled_deliveries WHERE id = ${id}::uuid FOR UPDATE`;
    if (rows.length === 0) return null;
    const row = await this.tx.scheduledDelivery.findUnique({ where: { id }, include: recordInclude });
    return row ? toRecord(row) : null;
  }

  async setStatus(id: string, status: DeliveryRecord["status"]) {
    await this.tx.scheduledDelivery.update({ where: { id }, data: { status } });
  }

  async create(data: DeliveryData, rescheduledFromId?: string) {
    const row = await this.tx.scheduledDelivery.create({
      data: {
        supplierId: data.supplierId,
        scheduledAt: data.scheduledAt,
        type: data.type,
        orderNumber: data.orderNumber,
        responsibleUserId: data.responsibleUserId,
        notes: data.notes,
        rescheduledFromId: rescheduledFromId ?? null,
        expectedItems: { create: data.expectedItems },
      },
      include: recordInclude,
    });
    return toRecord(row);
  }

  async update(id: string, data: DeliveryEditData) {
    await this.tx.deliveryExpectedItem.deleteMany({ where: { deliveryId: id } });
    const row = await this.tx.scheduledDelivery.update({
      where: { id },
      data: {
        type: data.type,
        orderNumber: data.orderNumber,
        responsibleUserId: data.responsibleUserId,
        notes: data.notes,
        expectedItems: { create: data.expectedItems },
      },
      include: recordInclude,
    });
    return toRecord(row);
  }

  async hasReceipts(id: string) {
    return (await this.tx.receipt.count({ where: { deliveryId: id } })) > 0;
  }

  async supplierStatus(id: string) {
    return (await this.tx.supplier.findUnique({ where: { id }, select: { status: true } }))?.status ?? null;
  }

  async userIsActive(id: string) {
    return (await this.tx.user.count({ where: { id, active: true } })) > 0;
  }

  async productStatuses(ids: readonly string[]) {
    const rows = await this.tx.product.findMany({ where: { id: { in: [...ids] } }, select: { id: true, status: true } });
    return new Map(rows.map((row) => [row.id, row.status]));
  }
}

export class PrismaDeliveryUnitOfWork implements DeliveryUnitOfWork {
  constructor(private readonly transact: TransactionRunner) {}

  run<T>(work: (tx: DeliveryTx) => Promise<T>): Promise<T> {
    return this.transact((tx) => work(new PrismaDeliveryTx(tx)));
  }
}
