import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AuthUser } from "@/modules/auth/domain/permissions";
import type { ProductInput } from "@/modules/catalog/application/product-input";
import { buildCatalogModule } from "@/modules/catalog/composition";
import type { SupplierListQuery } from "@/modules/suppliers/application/ports";
import type { SupplierInput } from "@/modules/suppliers/application/supplier-input";
import { buildSuppliersModule } from "@/modules/suppliers/composition";
import { cuitCheckDigit } from "@/modules/suppliers/domain/cuit";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/shared/domain/errors";
import { prisma } from "@/shared/infrastructure/db/prisma";
import { getTestActor, seededCategoryAndUnit } from "./support/fixtures";

const run = crypto.randomUUID().slice(0, 8);
const { supplierService } = buildSuppliersModule();
const { catalogService } = buildCatalogModule();

let admin: AuthUser;
let employee: AuthUser;
const supplierIds: string[] = [];
const productIds: string[] = [];

/** A random, valid 11-digit CUIT (prefix 30). */
function randomCuit(): string {
  for (;;) {
    const body = `30${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
    const digit = cuitCheckDigit(body);
    if (digit !== null) return `${body}${digit}`;
  }
}

function supplierInput(overrides: Partial<SupplierInput> = {}): SupplierInput {
  return {
    name: `IT Proveedor ${run}`,
    cuit: null,
    contactName: null,
    phone: null,
    email: null,
    address: null,
    visitDays: [],
    deliveryHours: null,
    leadTimeDays: null,
    status: "ACTIVE",
    notes: null,
    ...overrides,
  };
}

const listQuery = (overrides: Partial<SupplierListQuery> = {}): SupplierListQuery => ({
  status: "",
  sort: "name",
  dir: "asc",
  page: 1,
  pageSize: 20,
  ...overrides,
});

async function createSupplier(overrides: Partial<SupplierInput> = {}) {
  const supplier = await supplierService.createSupplier(admin, supplierInput(overrides));
  supplierIds.push(supplier.id);
  return supplier;
}

beforeAll(async () => {
  [admin, employee] = await Promise.all([getTestActor("admin"), getTestActor("employee")]);
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { entityId: { in: [...supplierIds, ...productIds] } } });
  await prisma.supplier.deleteMany({ where: { id: { in: supplierIds } } }); // supplied products cascade
  await prisma.product.deleteMany({ where: { id: { in: productIds } } });
  await prisma.$disconnect();
});

describe("suppliers", () => {
  it("creates a supplier with all fields, stores the CUIT as digits and audits it", async () => {
    const cuit = randomCuit();
    const supplier = await createSupplier({
      cuit,
      contactName: "Ana",
      phone: "011 5555-0000",
      email: "ventas@proveedor.test",
      visitDays: [1, 4],
      deliveryHours: "8 a 12 hs",
      leadTimeDays: 2,
    });
    expect(supplier).toMatchObject({ cuit, visitDays: [1, 4], leadTimeDays: 2, status: "ACTIVE", productCount: 0 });

    const audit = await prisma.auditLog.findFirst({ where: { entityId: supplier.id, action: "supplier.create" } });
    expect(audit?.actorId).toBe(admin.id);
  });

  it("rejects a duplicate CUIT on create and update with a field error", async () => {
    const cuit = randomCuit();
    await createSupplier({ cuit });
    const rejection = await supplierService.createSupplier(admin, supplierInput({ cuit })).catch((error) => error);
    expect(rejection).toBeInstanceOf(ConflictError);
    expect(rejection.fieldErrors.cuit).toBeDefined();

    const other = await createSupplier({ name: `IT Otro ${run}` });
    await expect(supplierService.updateSupplier(admin, other.id, supplierInput({ name: other.name, cuit }))).rejects.toBeInstanceOf(ConflictError);
    // Saving a supplier with its own CUIT is not a duplicate.
    const same = await createSupplier({ cuit: randomCuit() });
    await expect(supplierService.updateSupplier(admin, same.id, supplierInput({ cuit: same.cuit }))).resolves.toMatchObject({ id: same.id });
  });

  it("denies master data changes to an employee but lets them read", async () => {
    const supplier = await createSupplier();
    await expect(supplierService.createSupplier(employee, supplierInput())).rejects.toBeInstanceOf(ForbiddenError);
    await expect(supplierService.updateSupplier(employee, supplier.id, supplierInput())).rejects.toBeInstanceOf(ForbiddenError);
    await expect(supplierService.setActive(employee, supplier.id, false)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(supplierService.addProduct(employee, supplier.id, crypto.randomUUID())).rejects.toBeInstanceOf(ForbiddenError);
    await expect(supplierService.removeProduct(employee, supplier.id, crypto.randomUUID())).rejects.toBeInstanceOf(ForbiddenError);

    await expect(supplierService.getSupplier(employee, supplier.id)).resolves.toMatchObject({ id: supplier.id });
    await expect(supplierService.listSuppliers(employee, listQuery({ search: `IT Proveedor ${run}` }))).resolves.toMatchObject({ total: expect.any(Number) });
    const nobody: AuthUser = { ...employee, permissions: [] };
    await expect(supplierService.listSuppliers(nobody, listQuery())).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("searches by name, contact and CUIT digits, filters by status and sorts", async () => {
    const marker = `Zeta${run}`;
    const cuit = randomCuit();
    const active = await createSupplier({ name: `${marker} Sur`, cuit, contactName: "Marta Gómez" });
    const inactive = await createSupplier({ name: `${marker} Norte`, status: "INACTIVE" });

    const byName = await supplierService.listSuppliers(admin, listQuery({ search: marker }));
    expect(byName.items.map((s) => s.id)).toEqual([inactive.id, active.id]); // "Norte" < "Sur"

    const byContact = await supplierService.listSuppliers(admin, listQuery({ search: "marta gómez" }));
    expect(byContact.items.map((s) => s.id)).toContain(active.id);

    // The user may type the CUIT with hyphens: only digits are compared.
    const typed = `${cuit.slice(0, 2)}-${cuit.slice(2, 10)}-${cuit.slice(10)}`;
    const byCuit = await supplierService.listSuppliers(admin, listQuery({ search: typed }));
    expect(byCuit.items.map((s) => s.id)).toEqual([active.id]);

    const onlyInactive = await supplierService.listSuppliers(admin, listQuery({ search: marker, status: "INACTIVE" }));
    expect(onlyInactive.items.map((s) => s.id)).toEqual([inactive.id]);
    const desc = await supplierService.listSuppliers(admin, listQuery({ search: marker, dir: "desc" }));
    expect(desc.items.map((s) => s.id)).toEqual([active.id, inactive.id]);
    const page2 = await supplierService.listSuppliers(admin, listQuery({ search: marker, pageSize: 1, page: 2 }));
    expect(page2).toMatchObject({ total: 2, items: [{ id: active.id }] });
  });

  it("activates and deactivates with audit entries, and reports a missing supplier", async () => {
    const supplier = await createSupplier();
    await supplierService.setActive(admin, supplier.id, false);
    expect((await supplierService.getSupplier(admin, supplier.id)).status).toBe("INACTIVE");
    await supplierService.setActive(admin, supplier.id, false); // no-op, no second audit entry
    await supplierService.setActive(admin, supplier.id, true);
    expect((await supplierService.getSupplier(admin, supplier.id)).status).toBe("ACTIVE");

    const actions = (await prisma.auditLog.findMany({ where: { entityId: supplier.id }, orderBy: { createdAt: "asc" } })).map((entry) => entry.action);
    expect(actions).toEqual(["supplier.create", "supplier.deactivate", "supplier.activate"]);
    await expect(supplierService.getSupplier(admin, crypto.randomUUID())).rejects.toBeInstanceOf(NotFoundError);
  });

  it("adds and removes supplied products, rejecting duplicates and archived products", async () => {
    const supplier = await createSupplier();
    const { categoryId, unitId } = await seededCategoryAndUnit();
    const make = async (suffix: string) => {
      const product = await catalogService.createProduct(admin, {
        code: `TEST-${crypto.randomUUID()}`,
        commercialName: `IT Producto ${suffix} ${run}`,
        activeIngredient: null,
        brand: null,
        laboratory: null,
        barcode: null,
        sku: null,
        categoryId,
        presentation: null,
        concentration: null,
        pharmaceuticalForm: null,
        contentPerPackage: null,
        unitId,
        minStock: 0,
        maxStock: null,
        costPrice: "0.00",
        salePrice: null,
        usualSupplierId: null,
        location: null,
        status: "ACTIVE",
        notes: null,
      } satisfies ProductInput);
      productIds.push(product.id);
      return product;
    };
    const first = await make("A");
    const archived = await make("B");
    await catalogService.setArchived(admin, archived.id, true);

    await supplierService.addProduct(admin, supplier.id, first.id);
    expect((await supplierService.listProducts(employee, supplier.id)).map((p) => p.productId)).toEqual([first.id]);
    expect((await supplierService.getSupplier(admin, supplier.id)).productCount).toBe(1);

    await expect(supplierService.addProduct(admin, supplier.id, first.id)).rejects.toBeInstanceOf(ConflictError);
    await expect(supplierService.addProduct(admin, supplier.id, archived.id)).rejects.toBeInstanceOf(ValidationError);
    await expect(supplierService.addProduct(admin, supplier.id, crypto.randomUUID())).rejects.toBeInstanceOf(ValidationError);

    await supplierService.removeProduct(admin, supplier.id, first.id);
    expect(await supplierService.listProducts(admin, supplier.id)).toEqual([]);
    await expect(supplierService.removeProduct(admin, supplier.id, first.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
