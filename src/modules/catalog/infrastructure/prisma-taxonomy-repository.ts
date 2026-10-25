import { ConflictError } from "@/shared/domain/errors";
import { type DbClient, isForeignKeyViolation, isUniqueViolation } from "@/shared/infrastructure/db/types";
import type { SupplierLookup, SupplierOption, TaxonomyRecord, TaxonomyRepository } from "../application/ports";

interface Row {
  id: string;
  name: string;
  active: boolean;
  _count: { products: number };
}

function toRecord(row: Row): TaxonomyRecord {
  return { id: row.id, name: row.name, active: row.active, productCount: row._count.products };
}

const IN_USE_MESSAGE = "No se puede eliminar: hay productos que la usan. Podés desactivarla.";
const DUPLICATE_MESSAGE = "Ya existe un registro con ese nombre.";

/** Categories and units are structurally identical, so one adapter serves both delegates. */
interface TaxonomyDelegate {
  findMany(args: { orderBy: { name: "asc" }; include: { _count: { select: { products: true } } } }): Promise<Row[]>;
  findUnique(args: { where: { id: string }; include: { _count: { select: { products: true } } } }): Promise<Row | null>;
  findFirst(args: {
    where: { name: { equals: string; mode: "insensitive" } };
    include: { _count: { select: { products: true } } };
  }): Promise<Row | null>;
  create(args: { data: { name: string }; include: { _count: { select: { products: true } } } }): Promise<Row>;
  update(args: { where: { id: string }; data: { name?: string; active?: boolean } }): Promise<unknown>;
  delete(args: { where: { id: string } }): Promise<unknown>;
}

const withCount = { _count: { select: { products: true } } } as const;

class PrismaTaxonomyRepository implements TaxonomyRepository {
  constructor(private readonly delegate: TaxonomyDelegate) {}

  async list() {
    return (await this.delegate.findMany({ orderBy: { name: "asc" }, include: withCount })).map(toRecord);
  }

  async findById(id: string) {
    const row = await this.delegate.findUnique({ where: { id }, include: withCount });
    return row ? toRecord(row) : null;
  }

  async findByName(name: string) {
    const row = await this.delegate.findFirst({ where: { name: { equals: name, mode: "insensitive" } }, include: withCount });
    return row ? toRecord(row) : null;
  }

  async create(name: string) {
    try {
      return toRecord(await this.delegate.create({ data: { name }, include: withCount }));
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError("Duplicate name", DUPLICATE_MESSAGE, { name: [DUPLICATE_MESSAGE] });
      throw error;
    }
  }

  async rename(id: string, name: string) {
    try {
      await this.delegate.update({ where: { id }, data: { name } });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError("Duplicate name", DUPLICATE_MESSAGE, { name: [DUPLICATE_MESSAGE] });
      throw error;
    }
  }

  async setActive(id: string, active: boolean) {
    await this.delegate.update({ where: { id }, data: { active } });
  }

  async delete(id: string) {
    try {
      await this.delegate.delete({ where: { id } });
    } catch (error) {
      // A product started using it between the in-use check and the delete.
      if (isForeignKeyViolation(error)) throw new ConflictError("Taxonomy item in use", IN_USE_MESSAGE);
      throw error;
    }
  }
}

export function createCategoryRepository(db: DbClient): TaxonomyRepository {
  return new PrismaTaxonomyRepository(db.category as unknown as TaxonomyDelegate);
}

export function createUnitRepository(db: DbClient): TaxonomyRepository {
  return new PrismaTaxonomyRepository(db.unit as unknown as TaxonomyDelegate);
}

/** Read-only access to suppliers until the suppliers module (T3.1) owns them. */
export class PrismaSupplierLookup implements SupplierLookup {
  constructor(private readonly db: DbClient) {}

  async listOptions(): Promise<SupplierOption[]> {
    const suppliers = await this.db.supplier.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    return suppliers;
  }

  async exists(id: string) {
    return (await this.db.supplier.count({ where: { id } })) > 0;
  }
}
