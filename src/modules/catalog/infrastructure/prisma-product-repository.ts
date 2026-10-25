import type { Prisma } from "@/generated/prisma/client";
import { todayInTz } from "@/shared/domain/dates";
import { ConflictError } from "@/shared/domain/errors";
import { productIdsAtStockLevel } from "@/shared/infrastructure/db/stock-level-sql";
import { type DbClient, isUniqueViolation } from "@/shared/infrastructure/db/types";
import type {
  DuplicateField,
  Page,
  ProductData,
  ProductListQuery,
  ProductRecord,
  ProductRepository,
} from "../application/ports";

const include = { category: true, unit: true, usualSupplier: true } satisfies Prisma.ProductInclude;
type ProductWithRelations = Prisma.ProductGetPayload<{ include: typeof include }>;

function toRecord(product: ProductWithRelations): ProductRecord {
  return {
    id: product.id,
    code: product.code,
    commercialName: product.commercialName,
    activeIngredient: product.activeIngredient,
    brand: product.brand,
    laboratory: product.laboratory,
    barcode: product.barcode,
    sku: product.sku,
    categoryId: product.categoryId,
    categoryName: product.category.name,
    presentation: product.presentation,
    concentration: product.concentration,
    pharmaceuticalForm: product.pharmaceuticalForm,
    contentPerPackage: product.contentPerPackage,
    unitId: product.unitId,
    unitName: product.unit.name,
    minStock: product.minStock,
    maxStock: product.maxStock,
    costPrice: product.costPrice.toFixed(2),
    salePrice: product.salePrice ? product.salePrice.toFixed(2) : null,
    usualSupplierId: product.usualSupplierId,
    usualSupplierName: product.usualSupplier?.name ?? null,
    location: product.location,
    status: product.status,
    notes: product.notes,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

function toWriteData(data: ProductData) {
  return {
    code: data.code,
    commercialName: data.commercialName,
    activeIngredient: data.activeIngredient,
    brand: data.brand,
    laboratory: data.laboratory,
    barcode: data.barcode,
    sku: data.sku,
    categoryId: data.categoryId,
    presentation: data.presentation,
    concentration: data.concentration,
    pharmaceuticalForm: data.pharmaceuticalForm,
    contentPerPackage: data.contentPerPackage,
    unitId: data.unitId,
    minStock: data.minStock,
    maxStock: data.maxStock,
    costPrice: data.costPrice,
    salePrice: data.salePrice,
    usualSupplierId: data.usualSupplierId,
    location: data.location,
    status: data.status,
    notes: data.notes,
  };
}

function buildWhere(query: ProductListQuery): Prisma.ProductWhereInput {
  const and: Prisma.ProductWhereInput[] = [];
  if (query.search) {
    const contains = { contains: query.search, mode: "insensitive" as const };
    and.push({
      OR: [
        { commercialName: contains },
        { activeIngredient: contains },
        { brand: contains },
        { barcode: contains },
        { sku: contains },
        { code: contains },
      ],
    });
  }
  if (query.categoryId) and.push({ categoryId: query.categoryId });
  if (query.supplierId) and.push({ usualSupplierId: query.supplierId });
  if (query.status === "") and.push({ status: { not: "ARCHIVED" } });
  else if (query.status !== "ALL") and.push({ status: query.status });
  return { AND: and };
}

function buildOrderBy(query: ProductListQuery): Prisma.ProductOrderByWithRelationInput[] {
  const { dir } = query;
  const primary: Prisma.ProductOrderByWithRelationInput =
    query.sort === "code"
      ? { code: dir }
      : query.sort === "category"
        ? { category: { name: dir } }
        : query.sort === "minStock"
          ? { minStock: dir }
          : query.sort === "updatedAt"
            ? { updatedAt: dir }
            : { commercialName: dir };
  // `id` makes the order total so pagination is stable.
  return [primary, { id: "asc" }];
}

export class PrismaProductRepository implements ProductRepository {
  constructor(private readonly db: DbClient) {}

  async findById(id: string) {
    const product = await this.db.product.findUnique({ where: { id }, include });
    return product ? toRecord(product) : null;
  }

  async findByBarcode(barcode: string) {
    const product = await this.db.product.findUnique({ where: { barcode }, include });
    return product ? toRecord(product) : null;
  }

  async findDuplicateField(data: Pick<ProductData, "code" | "barcode" | "sku">, excludeId?: string): Promise<DuplicateField | null> {
    const or: Prisma.ProductWhereInput[] = [{ code: data.code }];
    if (data.barcode) or.push({ barcode: data.barcode });
    if (data.sku) or.push({ sku: data.sku });
    const existing = await this.db.product.findFirst({
      where: { OR: or, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { code: true, barcode: true, sku: true },
    });
    if (!existing) return null;
    if (data.barcode && existing.barcode === data.barcode) return "barcode";
    if (data.sku && existing.sku === data.sku) return "sku";
    return "code";
  }

  async create(data: ProductData) {
    try {
      return toRecord(await this.db.product.create({ data: toWriteData(data), include }));
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError("Unique constraint violated on product");
      throw error;
    }
  }

  async update(id: string, data: ProductData) {
    try {
      return toRecord(await this.db.product.update({ where: { id }, data: toWriteData(data), include }));
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError("Unique constraint violated on product");
      throw error;
    }
  }

  async setStatus(id: string, status: ProductData["status"]) {
    await this.db.product.update({ where: { id }, data: { status } });
  }

  async list(query: ProductListQuery): Promise<Page<ProductRecord>> {
    const where = buildWhere(query);
    if (query.stock) {
      (where.AND as Prisma.ProductWhereInput[]).push({ id: { in: await productIdsAtStockLevel(this.db, query.stock, todayInTz()) } });
    }
    const [total, rows] = await Promise.all([
      this.db.product.count({ where }),
      this.db.product.findMany({
        where,
        include,
        orderBy: buildOrderBy(query),
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { items: rows.map(toRecord), total };
  }
}
