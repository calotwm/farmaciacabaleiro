import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildCatalogModule } from "@/modules/catalog/composition";
import type { ProductInput } from "@/modules/catalog/application/product-input";
import type { ProductListQuery } from "@/modules/catalog/application/ports";
import type { AuthUser } from "@/modules/auth/domain/permissions";
import { ConflictError, ForbiddenError, ValidationError } from "@/shared/domain/errors";
import { prisma } from "@/shared/infrastructure/db/prisma";
import { getTestActor, seededCategoryAndUnit } from "./support/fixtures";

const run = crypto.randomUUID().slice(0, 8);
const { catalogService, taxonomyService } = buildCatalogModule();

let admin: AuthUser;
let employee: AuthUser;
let categoryId: string;
let unitId: string;

const productIds: string[] = [];
const categoryIds: string[] = [];
const unitIds: string[] = [];

function productInput(overrides: Partial<ProductInput> = {}): ProductInput {
  return {
    code: null,
    commercialName: `IT Cepillo ${run}`,
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
    ...overrides,
  };
}

const listQuery = (overrides: Partial<ProductListQuery> = {}): ProductListQuery => ({
  status: "",
  sort: "name",
  dir: "asc",
  page: 1,
  pageSize: 20,
  ...overrides,
});

async function createProduct(overrides: Partial<ProductInput> = {}) {
  const product = await catalogService.createProduct(admin, productInput(overrides));
  productIds.push(product.id);
  return product;
}

beforeAll(async () => {
  [admin, employee] = await Promise.all([getTestActor("admin"), getTestActor("employee")]);
  ({ categoryId, unitId } = await seededCategoryAndUnit());
});

afterAll(async () => {
  const entityIds = [...productIds, ...categoryIds, ...unitIds];
  await prisma.auditLog.deleteMany({ where: { entityId: { in: entityIds } } });
  await prisma.product.deleteMany({ where: { id: { in: productIds } } });
  await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
  await prisma.unit.deleteMany({ where: { id: { in: unitIds } } });
  await prisma.$disconnect();
});

describe("products", () => {
  it("creates a non-medication product without pharmacological fields and audits it", async () => {
    const product = await createProduct({ barcode: `7790${run}1`, minStock: 3, costPrice: "1250.50" });

    expect(product.code).toMatch(/^P-/);
    expect(product.activeIngredient).toBeNull();
    expect(product.costPrice).toBe("1250.50");
    expect(product.status).toBe("ACTIVE");
    const audit = await prisma.auditLog.findFirst({ where: { action: "product.create", entityId: product.id } });
    expect(audit?.actorId).toBe(admin.id);
    expect(await catalogService.findByBarcode(employee, `7790${run}1`)).toMatchObject({ id: product.id });
  });

  it("rejects a duplicate barcode with a Spanish message on the field", async () => {
    await createProduct({ barcode: `7791${run}` });
    const attempt = catalogService.createProduct(admin, productInput({ commercialName: "Otro", barcode: `7791${run}` }));

    await expect(attempt).rejects.toBeInstanceOf(ConflictError);
    await expect(attempt).rejects.toMatchObject({
      userMessage: "Ya existe un producto con ese código de barras.",
      fieldErrors: { barcode: ["Ya existe un producto con ese código de barras."] },
    });
  });

  it("rejects a duplicate SKU and a duplicate explicit code", async () => {
    await createProduct({ sku: `SKU-${run}`, code: `IT-${run}` });
    await expect(catalogService.createProduct(admin, productInput({ sku: `SKU-${run}` }))).rejects.toMatchObject({
      fieldErrors: { sku: ["Ya existe un producto con ese SKU."] },
    });
    await expect(catalogService.createProduct(admin, productInput({ code: `IT-${run}` }))).rejects.toMatchObject({
      fieldErrors: { code: expect.any(Array) },
    });
  });

  it("an employee without permission cannot create, edit or archive products", async () => {
    const product = await createProduct();
    await expect(catalogService.createProduct(employee, productInput())).rejects.toBeInstanceOf(ForbiddenError);
    await expect(catalogService.updateProduct(employee, product.id, productInput())).rejects.toBeInstanceOf(ForbiddenError);
    await expect(catalogService.setArchived(employee, product.id, true)).rejects.toBeInstanceOf(ForbiddenError);
    // ...but can read.
    await expect(catalogService.getProduct(employee, product.id)).resolves.toMatchObject({ id: product.id });
  });

  it("edits a product, keeping its code, and records before/after in the audit log", async () => {
    const product = await createProduct({ commercialName: `IT Editable ${run}` });
    const updated = await catalogService.updateProduct(admin, product.id, productInput({ commercialName: `IT Editado ${run}`, minStock: 7 }));

    expect(updated.code).toBe(product.code);
    expect(updated.minStock).toBe(7);
    const audit = await prisma.auditLog.findFirst({ where: { action: "product.update", entityId: product.id } });
    expect(audit?.before).toMatchObject({ commercialName: `IT Editable ${run}`, minStock: 0 });
    expect(audit?.after).toMatchObject({ commercialName: `IT Editado ${run}`, minStock: 7 });
  });

  it("archived products are hidden by default, listed on request, and cannot be edited", async () => {
    const product = await createProduct({ commercialName: `IT Archivable ${run}` });
    await catalogService.setArchived(admin, product.id, true);

    const hidden = await catalogService.listProducts(employee, listQuery({ search: `IT Archivable ${run}` }));
    expect(hidden.items).toHaveLength(0);
    const archived = await catalogService.listProducts(employee, listQuery({ search: `IT Archivable ${run}`, status: "ARCHIVED" }));
    expect(archived.items.map((p) => p.id)).toEqual([product.id]);
    await expect(catalogService.updateProduct(admin, product.id, productInput())).rejects.toBeInstanceOf(ConflictError);

    await catalogService.setArchived(admin, product.id, false);
    const back = await catalogService.listProducts(employee, listQuery({ search: `IT Archivable ${run}` }));
    expect(back.items.map((p) => p.id)).toEqual([product.id]);
  });

  it("searches by name, active ingredient, brand and SKU, filters by category and paginates", async () => {
    const unique = `Zzq${run}`;
    const a = await createProduct({ commercialName: `${unique} Alfa`, activeIngredient: `principio-${unique}`, brand: `marca-${unique}`, sku: `S-${unique}` });
    const b = await createProduct({ commercialName: `${unique} Beta` });

    for (const search of [`principio-${unique}`.toUpperCase(), `marca-${unique}`, `S-${unique}`]) {
      const found = await catalogService.listProducts(employee, listQuery({ search }));
      expect(found.items.map((p) => p.id)).toEqual([a.id]);
    }
    const byName = await catalogService.listProducts(employee, listQuery({ search: unique, categoryId, dir: "desc" }));
    expect(byName.items.map((p) => p.id)).toEqual([b.id, a.id]);
    const otherCategory = await prisma.category.findFirstOrThrow({ where: { id: { not: categoryId } } });
    expect((await catalogService.listProducts(employee, listQuery({ search: unique, categoryId: otherCategory.id }))).total).toBe(0);

    const page2 = await catalogService.listProducts(employee, listQuery({ search: unique, page: 2, pageSize: 1 }));
    expect(page2.total).toBe(2);
    expect(page2.items.map((p) => p.id)).toEqual([b.id]);
  });

  it("does not let a product use a missing or inactive category", async () => {
    const category = await taxonomyService.create(admin, "category", `IT Inactiva ${run}`);
    categoryIds.push(category.id);
    await taxonomyService.setActive(admin, "category", category.id, false);

    await expect(catalogService.createProduct(admin, productInput({ categoryId: category.id }))).rejects.toBeInstanceOf(ValidationError);
    await expect(
      catalogService.createProduct(admin, productInput({ categoryId: crypto.randomUUID() })),
    ).rejects.toMatchObject({ fieldErrors: { categoryId: ["La categoría elegida no existe."] } });
  });
});

describe("categories and units admin", () => {
  it("creates, renames, deactivates and deletes an unused category, auditing each step", async () => {
    const category = await taxonomyService.create(admin, "category", `  IT   Categoría ${run} `);
    categoryIds.push(category.id);
    expect(category.name).toBe(`IT Categoría ${run}`);

    await expect(taxonomyService.create(admin, "category", `it categoría ${run}`)).rejects.toMatchObject({
      fieldErrors: { name: ["Ya existe una categoría con ese nombre."] },
    });

    await taxonomyService.rename(admin, "category", category.id, `IT Renombrada ${run}`);
    await taxonomyService.setActive(admin, "category", category.id, false);
    const listed = (await taxonomyService.list(employee, "category")).find((c) => c.id === category.id);
    expect(listed).toMatchObject({ name: `IT Renombrada ${run}`, active: false, productCount: 0 });

    await taxonomyService.remove(admin, "category", category.id);
    expect((await taxonomyService.list(employee, "category")).some((c) => c.id === category.id)).toBe(false);
    const actions = (await prisma.auditLog.findMany({ where: { entityId: category.id } })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["category.create", "category.rename", "category.deactivate", "category.delete"]));
  });

  it("refuses to delete a unit that products use, but allows deactivating it", async () => {
    const unit = await taxonomyService.create(admin, "unit", `IT Unidad ${run}`);
    unitIds.push(unit.id);
    await createProduct({ unitId: unit.id });

    await expect(taxonomyService.remove(admin, "unit", unit.id)).rejects.toBeInstanceOf(ConflictError);
    await taxonomyService.setActive(admin, "unit", unit.id, false);
    expect((await taxonomyService.list(admin, "unit")).find((u) => u.id === unit.id)).toMatchObject({ active: false, productCount: 1 });
  });

  it("requires catalog.manage to administer, products.read to list", async () => {
    await expect(taxonomyService.create(employee, "category", "No permitido")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(taxonomyService.rename(employee, "unit", crypto.randomUUID(), "x")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(taxonomyService.list(employee, "unit")).resolves.toBeInstanceOf(Array);
  });
});
