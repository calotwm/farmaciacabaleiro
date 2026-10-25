import type { RecordAudit } from "@/modules/audit/application/record-audit";
import { assertPermission, type AuthUser } from "@/modules/auth/domain/permissions";
import { ConflictError, NotFoundError, ValidationError, hasErrorCode } from "@/shared/domain/errors";
import { generateProductCode } from "../domain/product";
import type {
  DuplicateField,
  ProductListQuery,
  ProductRecord,
  ProductRepository,
  SupplierLookup,
  TaxonomyRepository,
} from "./ports";
import { type ProductInput, toProductData } from "./product-input";

export interface CatalogDeps {
  products: ProductRepository;
  categories: TaxonomyRepository;
  units: TaxonomyRepository;
  suppliers: SupplierLookup;
  audit: RecordAudit;
  /** Injectable for tests: source of random bytes for generated product codes. */
  randomByte?: () => number;
}

const DUPLICATE_MESSAGES: Record<DuplicateField, string> = {
  code: "Ya existe un producto con ese código interno.",
  barcode: "Ya existe un producto con ese código de barras.",
  sku: "Ya existe un producto con ese SKU.",
};

const MAX_CODE_ATTEMPTS = 5;

/** Fields recorded in the audit trail (the whole product, flattened). */
function snapshot(product: ProductRecord) {
  return { ...product, createdAt: undefined, updatedAt: undefined };
}

export function createCatalogService({ products, categories, units, suppliers, audit, randomByte }: CatalogDeps) {
  async function assertReferences(input: ProductInput, previous?: ProductRecord) {
    const errors: Record<string, string[]> = {};
    const [category, unit] = await Promise.all([categories.findById(input.categoryId), units.findById(input.unitId)]);
    // An inactive category/unit may be kept by products that already use it, but not newly assigned.
    if (!category) errors.categoryId = ["La categoría elegida no existe."];
    else if (!category.active && previous?.categoryId !== category.id) errors.categoryId = ["La categoría elegida está inactiva."];
    if (!unit) errors.unitId = ["La unidad elegida no existe."];
    else if (!unit.active && previous?.unitId !== unit.id) errors.unitId = ["La unidad elegida está inactiva."];
    if (input.usualSupplierId && !(await suppliers.exists(input.usualSupplierId))) {
      errors.usualSupplierId = ["El proveedor elegido no existe."];
    }
    if (Object.keys(errors).length > 0) throw new ValidationError("Invalid references", errors);
  }

  function duplicateError(field: DuplicateField) {
    return new ConflictError(`Duplicate product ${field}`, DUPLICATE_MESSAGES[field], { [field]: [DUPLICATE_MESSAGES[field]] });
  }

  async function listProducts(actor: AuthUser, query: ProductListQuery) {
    assertPermission(actor, "products.read");
    return products.list(query);
  }

  async function getProduct(actor: AuthUser, id: string) {
    assertPermission(actor, "products.read");
    const product = await products.findById(id);
    if (!product) throw new NotFoundError("product");
    return product;
  }

  /** Exact barcode lookup (scanner flow). */
  async function findByBarcode(actor: AuthUser, barcode: string) {
    assertPermission(actor, "products.read");
    return products.findByBarcode(barcode);
  }

  async function listSupplierOptions(actor: AuthUser) {
    assertPermission(actor, "products.read");
    return suppliers.listOptions();
  }

  async function createProduct(actor: AuthUser, input: ProductInput, ip?: string) {
    assertPermission(actor, "products.write");
    await assertReferences(input);

    // A user-provided code must be unique; a generated one is retried on the (very unlikely) collision.
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      const generated = input.code === null;
      const code = input.code ?? generateProductCode(randomByte);
      const data = toProductData(input, code);
      const duplicate = await products.findDuplicateField(data);
      if (duplicate === "code" && generated) continue;
      if (duplicate) throw duplicateError(duplicate);

      try {
        const created = await products.create(data);
        await audit({ actorId: actor.id, action: "product.create", entityType: "product", entityId: created.id, after: snapshot(created), ip });
        return created;
      } catch (error) {
        // Lost a race with a concurrent insert: re-check to report the exact field.
        if (hasErrorCode(error, "CONFLICT")) {
          const raced = await products.findDuplicateField(data);
          if (raced === "code" && generated) continue;
          if (raced) throw duplicateError(raced);
        }
        throw error;
      }
    }
    throw new ConflictError("Could not generate a unique product code", "No se pudo generar un código interno. Intentá de nuevo.");
  }

  async function updateProduct(actor: AuthUser, id: string, input: ProductInput, ip?: string) {
    assertPermission(actor, "products.write");
    const previous = await products.findById(id);
    if (!previous) throw new NotFoundError("product");
    if (previous.status === "ARCHIVED") {
      throw new ConflictError("Archived product", "El producto está archivado. Desarchivalo para editarlo.");
    }
    await assertReferences(input, previous);

    const data = toProductData(input, input.code ?? previous.code);
    const duplicate = await products.findDuplicateField(data, id);
    if (duplicate) throw duplicateError(duplicate);

    try {
      const updated = await products.update(id, data);
      await audit({
        actorId: actor.id,
        action: "product.update",
        entityType: "product",
        entityId: id,
        before: snapshot(previous),
        after: snapshot(updated),
        ip,
      });
      return updated;
    } catch (error) {
      if (hasErrorCode(error, "CONFLICT")) {
        const raced = await products.findDuplicateField(data, id);
        if (raced) throw duplicateError(raced);
      }
      throw error;
    }
  }

  async function setArchived(actor: AuthUser, id: string, archived: boolean, ip?: string) {
    assertPermission(actor, "products.archive");
    const previous = await products.findById(id);
    if (!previous) throw new NotFoundError("product");
    if ((previous.status === "ARCHIVED") === archived) return;

    const status = archived ? "ARCHIVED" : "ACTIVE";
    await products.setStatus(id, status);
    await audit({
      actorId: actor.id,
      action: archived ? "product.archive" : "product.unarchive",
      entityType: "product",
      entityId: id,
      before: { status: previous.status },
      after: { status },
      ip,
    });
  }

  return { listProducts, getProduct, findByBarcode, listSupplierOptions, createProduct, updateProduct, setArchived };
}

export type CatalogService = ReturnType<typeof createCatalogService>;
