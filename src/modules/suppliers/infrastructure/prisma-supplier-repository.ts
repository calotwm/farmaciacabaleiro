import type { Prisma } from "@/generated/prisma/client";
import { ConflictError } from "@/shared/domain/errors";
import { type DbClient, isUniqueViolation } from "@/shared/infrastructure/db/types";
import type {
  Page,
  ProductRef,
  SuppliedProduct,
  SupplierData,
  SupplierListQuery,
  SupplierRecord,
  SupplierRepository,
} from "../application/ports";
import { normalizeCuit } from "../domain/cuit";
import { normalizeVisitDays } from "../domain/supplier";

const include = { _count: { select: { supplierProducts: true } } } satisfies Prisma.SupplierInclude;
type SupplierWithCount = Prisma.SupplierGetPayload<{ include: typeof include }>;

function toRecord(row: SupplierWithCount): SupplierRecord {
  return {
    id: row.id,
    name: row.name,
    cuit: row.cuit,
    contactName: row.contactName,
    phone: row.phone,
    email: row.email,
    address: row.address,
    visitDays: normalizeVisitDays(row.visitDays),
    deliveryHours: row.deliveryHours,
    leadTimeDays: row.leadTimeDays,
    status: row.status,
    notes: row.notes,
    productCount: row._count.supplierProducts,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function buildWhere(query: SupplierListQuery): Prisma.SupplierWhereInput {
  const and: Prisma.SupplierWhereInput[] = [];
  if (query.search) {
    const contains = { contains: query.search, mode: "insensitive" as const };
    const or: Prisma.SupplierWhereInput[] = [{ name: contains }, { contactName: contains }];
    // The CUIT is stored as digits: match however the user typed it (with or without hyphens).
    const digits = normalizeCuit(query.search);
    if (digits.length >= 3) or.push({ cuit: { contains: digits } });
    and.push({ OR: or });
  }
  if (query.status) and.push({ status: query.status });
  return { AND: and };
}

function buildOrderBy(query: SupplierListQuery): Prisma.SupplierOrderByWithRelationInput[] {
  const { dir } = query;
  const primary: Prisma.SupplierOrderByWithRelationInput =
    query.sort === "cuit"
      ? { cuit: { sort: dir, nulls: "last" } }
      : query.sort === "status"
        ? { status: dir }
        : query.sort === "leadTime"
          ? { leadTimeDays: { sort: dir, nulls: "last" } }
          : query.sort === "updatedAt"
            ? { updatedAt: dir }
            : { name: dir };
  // `id` makes the order total so pagination is stable.
  return [primary, { id: "asc" }];
}

export class PrismaSupplierRepository implements SupplierRepository {
  constructor(private readonly db: DbClient) {}

  async findById(id: string) {
    const row = await this.db.supplier.findUnique({ where: { id }, include });
    return row ? toRecord(row) : null;
  }

  async cuitTaken(cuit: string, excludeId?: string) {
    const existing = await this.db.supplier.findFirst({
      where: { cuit, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    return existing !== null;
  }

  async create(data: SupplierData) {
    try {
      return toRecord(await this.db.supplier.create({ data, include }));
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError("Unique constraint violated on supplier");
      throw error;
    }
  }

  async update(id: string, data: SupplierData) {
    try {
      return toRecord(await this.db.supplier.update({ where: { id }, data, include }));
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError("Unique constraint violated on supplier");
      throw error;
    }
  }

  async setStatus(id: string, status: SupplierData["status"]) {
    await this.db.supplier.update({ where: { id }, data: { status } });
  }

  async list(query: SupplierListQuery): Promise<Page<SupplierRecord>> {
    const where = buildWhere(query);
    const [total, rows] = await Promise.all([
      this.db.supplier.count({ where }),
      this.db.supplier.findMany({
        where,
        include,
        orderBy: buildOrderBy(query),
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { items: rows.map(toRecord), total };
  }

  async listProducts(supplierId: string): Promise<SuppliedProduct[]> {
    const rows = await this.db.supplierProduct.findMany({
      where: { supplierId },
      include: { product: { select: { code: true, commercialName: true, barcode: true, status: true } } },
      orderBy: [{ product: { commercialName: "asc" } }, { productId: "asc" }],
    });
    return rows.map((row) => ({
      productId: row.productId,
      code: row.product.code,
      name: row.product.commercialName,
      barcode: row.product.barcode,
      productStatus: row.product.status,
      linkedAt: row.createdAt,
    }));
  }

  async findProduct(productId: string): Promise<ProductRef | null> {
    return this.db.product.findUnique({ where: { id: productId }, select: { id: true, status: true } });
  }

  async isProductLinked(supplierId: string, productId: string) {
    return (await this.db.supplierProduct.count({ where: { supplierId, productId } })) > 0;
  }

  async addProduct(supplierId: string, productId: string) {
    try {
      await this.db.supplierProduct.create({ data: { supplierId, productId } });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError("Product already supplied");
      throw error;
    }
  }

  async removeProduct(supplierId: string, productId: string) {
    const { count } = await this.db.supplierProduct.deleteMany({ where: { supplierId, productId } });
    return count > 0;
  }
}
