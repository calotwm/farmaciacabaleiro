import type { Prisma } from "@/generated/prisma/client";
import { addDays, startOfDayInTz, toDbDate } from "@/shared/domain/dates";
import type { DbClient } from "@/shared/infrastructure/db/types";
import type {
  LotListItem,
  LotListQuery,
  MovementListItem,
  MovementListQuery,
  Page,
  ReasonRecord,
  StockReadRepository,
} from "../application/ports";
import type { ReasonKind } from "../domain/movement-type";
import { toLotState } from "./prisma-stock-tx";

const lotInclude = { product: { include: { unit: true } }, supplier: true } satisfies Prisma.LotInclude;
type LotWithRelations = Prisma.LotGetPayload<{ include: typeof lotInclude }>;

function toLotItem(row: LotWithRelations): LotListItem {
  return {
    ...toLotState(row),
    productCode: row.product.code,
    productName: row.product.commercialName,
    unitName: row.product.unit.name,
    supplierId: row.supplierId,
    supplierName: row.supplier?.name ?? null,
    invoiceNumber: row.invoiceNumber,
    location: row.location,
    unitCost: row.unitCost ? row.unitCost.toFixed(2) : null,
    notes: row.notes,
    initialQuantity: row.initialQuantity,
  };
}

function productSearch(search: string): Prisma.ProductWhereInput {
  const contains = { contains: search, mode: "insensitive" as const };
  return {
    OR: [
      { commercialName: contains },
      { activeIngredient: contains },
      { brand: contains },
      { barcode: contains },
      { sku: contains },
      { code: contains },
    ],
  };
}

function lotWhere(query: LotListQuery): Prisma.LotWhereInput {
  const and: Prisma.LotWhereInput[] = [];
  const today = toDbDate(query.today);
  const notExpired: Prisma.LotWhereInput = { expiryDate: { gte: today }, status: { not: "EXPIRED" } };

  if (query.search) {
    and.push({ OR: [{ lotNumber: { contains: query.search, mode: "insensitive" } }, { product: productSearch(query.search) }] });
  }
  if (query.productId) and.push({ productId: query.productId });
  if (query.categoryId) and.push({ product: { categoryId: query.categoryId } });
  if (query.supplierId) and.push({ supplierId: query.supplierId });
  if (query.expiryFrom) and.push({ expiryDate: { gte: toDbDate(query.expiryFrom) } });
  if (query.expiryTo) and.push({ expiryDate: { lte: toDbDate(query.expiryTo) } });

  // Status filters are on the EFFECTIVE state: a lot past its date is "EXPIRED" whatever is stored.
  switch (query.status) {
    case "":
      and.push({ currentQuantity: { gt: 0 } });
      break;
    case "EXPIRED":
      and.push({ OR: [{ expiryDate: { lt: today } }, { status: "EXPIRED" }] });
      break;
    case "ALL":
      break;
    default:
      and.push(notExpired, { status: query.status });
  }
  return { AND: and };
}

function lotOrderBy(query: LotListQuery): Prisma.LotOrderByWithRelationInput[] {
  const { dir } = query;
  const tiebreak: Prisma.LotOrderByWithRelationInput[] = [{ expiryDate: "asc" }, { receivedAt: "asc" }, { lotNumber: "asc" }, { id: "asc" }];
  switch (query.sort) {
    case "product":
      return [{ product: { commercialName: dir } }, ...tiebreak];
    case "lotNumber":
      return [{ lotNumber: dir }, ...tiebreak];
    case "quantity":
      return [{ currentQuantity: dir }, ...tiebreak];
    case "receivedAt":
      return [{ receivedAt: dir }, ...tiebreak];
    default:
      return [{ expiryDate: dir }, { receivedAt: "asc" }, { lotNumber: "asc" }, { id: "asc" }];
  }
}

function movementWhere(query: MovementListQuery): Prisma.StockMovementWhereInput {
  const where: Prisma.StockMovementWhereInput = {};
  if (query.search) {
    where.OR = [{ lot: { lotNumber: { contains: query.search, mode: "insensitive" } } }, { product: productSearch(query.search) }];
  }
  if (query.type) where.type = query.type;
  if (query.productId) where.productId = query.productId;
  if (query.lotId) where.lotId = query.lotId;
  if (query.userId) where.userId = query.userId;
  if (query.from || query.to) {
    where.occurredAt = {
      ...(query.from ? { gte: startOfDayInTz(query.from) } : {}),
      // Inclusive end day: everything before the start of the next day.
      ...(query.to ? { lt: startOfDayInTz(addDays(query.to, 1)) } : {}),
    };
  }
  return where;
}

export class PrismaStockReadRepository implements StockReadRepository {
  constructor(private readonly db: DbClient) {}

  async listLots(query: LotListQuery): Promise<Page<LotListItem>> {
    const where = lotWhere(query);
    const [total, rows] = await Promise.all([
      this.db.lot.count({ where }),
      this.db.lot.findMany({
        where,
        include: lotInclude,
        orderBy: lotOrderBy(query),
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { items: rows.map(toLotItem), total };
  }

  async getLot(id: string) {
    const row = await this.db.lot.findUnique({ where: { id }, include: lotInclude });
    return row ? toLotItem(row) : null;
  }

  async listProductLots(productId: string) {
    const rows = await this.db.lot.findMany({ where: { productId }, include: lotInclude });
    return rows.map(toLotItem);
  }

  async listMovements(query: MovementListQuery): Promise<Page<MovementListItem>> {
    const where = movementWhere(query);
    const [total, rows] = await Promise.all([
      this.db.stockMovement.count({ where }),
      this.db.stockMovement.findMany({
        where,
        include: { product: true, lot: true, reason: true, user: true },
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return {
      total,
      items: rows.map((row) => ({
        id: row.id,
        type: row.type,
        occurredAt: row.occurredAt,
        quantity: row.quantity,
        balanceAfter: row.balanceAfter,
        productId: row.productId,
        productName: row.product.commercialName,
        lotId: row.lotId,
        lotNumber: row.lot.lotNumber,
        reasonName: row.reason?.name ?? null,
        reasonText: row.reasonText,
        userName: row.user.name,
      })),
    };
  }

  async listReasons(kind?: ReasonKind): Promise<ReasonRecord[]> {
    const rows = await this.db.adjustmentReason.findMany({ where: kind ? { kind } : {}, orderBy: [{ kind: "asc" }, { name: "asc" }] });
    return rows.map((row) => ({ id: row.id, name: row.name, kind: row.kind, active: row.active }));
  }

  async listMovementUsers() {
    return this.db.user.findMany({
      where: { stockMovements: { some: {} } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  }

  async listSupplierOptions() {
    return this.db.supplier.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  }
}
