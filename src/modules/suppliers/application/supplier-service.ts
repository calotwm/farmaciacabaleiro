import type { RecordAudit } from "@/modules/audit/application/record-audit";
import { assertPermission, type AuthUser } from "@/modules/auth/domain/permissions";
import { ConflictError, NotFoundError, ValidationError, hasErrorCode } from "@/shared/domain/errors";
import type { SupplierStatus } from "../domain/supplier";
import type { SupplierListQuery, SupplierRecord, SupplierRepository } from "./ports";
import { type SupplierInput, toSupplierData } from "./supplier-input";

export interface SupplierServiceDeps {
  suppliers: SupplierRepository;
  audit: RecordAudit;
}

const DUPLICATE_CUIT = "Ya existe un proveedor con ese CUIT.";

/** Fields recorded in the audit trail. */
function snapshot(supplier: SupplierRecord) {
  return { ...supplier, createdAt: undefined, updatedAt: undefined };
}

/**
 * Suppliers and the products they supply. Reading needs `suppliers.read`; every change (master data,
 * status, supplied products) needs `suppliers.write`, which only the admin role has by default.
 */
export function createSupplierService({ suppliers, audit }: SupplierServiceDeps) {
  function duplicateCuit() {
    return new ConflictError("Duplicate supplier CUIT", DUPLICATE_CUIT, { cuit: [DUPLICATE_CUIT] });
  }

  async function requireSupplier(id: string) {
    const supplier = await suppliers.findById(id);
    if (!supplier) throw new NotFoundError("supplier");
    return supplier;
  }

  async function listSuppliers(actor: AuthUser, query: SupplierListQuery) {
    assertPermission(actor, "suppliers.read");
    return suppliers.list(query);
  }

  async function getSupplier(actor: AuthUser, id: string) {
    assertPermission(actor, "suppliers.read");
    return requireSupplier(id);
  }

  async function listProducts(actor: AuthUser, supplierId: string) {
    assertPermission(actor, "suppliers.read");
    return suppliers.listProducts(supplierId);
  }

  async function createSupplier(actor: AuthUser, input: SupplierInput, ip?: string) {
    assertPermission(actor, "suppliers.write");
    const data = toSupplierData(input);
    if (data.cuit && (await suppliers.cuitTaken(data.cuit))) throw duplicateCuit();

    try {
      const created = await suppliers.create(data);
      await audit({ actorId: actor.id, action: "supplier.create", entityType: "supplier", entityId: created.id, after: snapshot(created), ip });
      return created;
    } catch (error) {
      // Lost a race with a concurrent insert of the same CUIT.
      if (hasErrorCode(error, "CONFLICT")) throw duplicateCuit();
      throw error;
    }
  }

  async function updateSupplier(actor: AuthUser, id: string, input: SupplierInput, ip?: string) {
    assertPermission(actor, "suppliers.write");
    const previous = await requireSupplier(id);
    const data = toSupplierData(input);
    if (data.cuit && (await suppliers.cuitTaken(data.cuit, id))) throw duplicateCuit();

    try {
      const updated = await suppliers.update(id, data);
      await audit({
        actorId: actor.id,
        action: "supplier.update",
        entityType: "supplier",
        entityId: id,
        before: snapshot(previous),
        after: snapshot(updated),
        ip,
      });
      return updated;
    } catch (error) {
      if (hasErrorCode(error, "CONFLICT")) throw duplicateCuit();
      throw error;
    }
  }

  /** Inactive suppliers keep their history but are not offered for new deliveries or receipts. */
  async function setActive(actor: AuthUser, id: string, active: boolean, ip?: string) {
    assertPermission(actor, "suppliers.write");
    const previous = await requireSupplier(id);
    const status: SupplierStatus = active ? "ACTIVE" : "INACTIVE";
    if (previous.status === status) return;
    await suppliers.setStatus(id, status);
    await audit({
      actorId: actor.id,
      action: active ? "supplier.activate" : "supplier.deactivate",
      entityType: "supplier",
      entityId: id,
      before: { status: previous.status },
      after: { status },
      ip,
    });
  }

  async function addProduct(actor: AuthUser, supplierId: string, productId: string, ip?: string) {
    assertPermission(actor, "suppliers.write");
    await requireSupplier(supplierId);
    const product = await suppliers.findProduct(productId);
    if (!product) throw new ValidationError("Product not found", { productId: ["El producto elegido no existe."] });
    if (product.status === "ARCHIVED") {
      throw new ValidationError("Product archived", { productId: ["El producto está archivado."] });
    }
    if (await suppliers.isProductLinked(supplierId, productId)) {
      throw new ConflictError("Product already supplied", "El proveedor ya tiene ese producto.", {
        productId: ["El proveedor ya tiene ese producto."],
      });
    }
    try {
      await suppliers.addProduct(supplierId, productId);
    } catch (error) {
      if (hasErrorCode(error, "CONFLICT")) {
        throw new ConflictError("Product already supplied", "El proveedor ya tiene ese producto.");
      }
      throw error;
    }
    await audit({ actorId: actor.id, action: "supplier.product.add", entityType: "supplier", entityId: supplierId, after: { productId }, ip });
  }

  async function removeProduct(actor: AuthUser, supplierId: string, productId: string, ip?: string) {
    assertPermission(actor, "suppliers.write");
    await requireSupplier(supplierId);
    if (!(await suppliers.removeProduct(supplierId, productId))) throw new NotFoundError("supplier product");
    await audit({ actorId: actor.id, action: "supplier.product.remove", entityType: "supplier", entityId: supplierId, before: { productId }, ip });
  }

  return { listSuppliers, getSupplier, listProducts, createSupplier, updateSupplier, setActive, addProduct, removeProduct };
}

export type SupplierService = ReturnType<typeof createSupplierService>;
