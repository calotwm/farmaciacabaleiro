import { describe, expect, it } from "vitest";
import { productInputSchema } from "./product-input";

const CATEGORY_ID = "7f6b1d2e-3c4a-4b5d-8e9f-0a1b2c3d4e5f";
const UNIT_ID = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

const base = { commercialName: "Cepillo dental", categoryId: CATEGORY_ID, unitId: UNIT_ID };

function fieldErrors(input: Record<string, string>) {
  const result = productInputSchema.safeParse(input);
  if (result.success) return {};
  const errors: Record<string, string[]> = {};
  for (const issue of result.error.issues) (errors[String(issue.path[0])] ??= []).push(issue.message);
  return errors;
}

describe("productInputSchema", () => {
  it("accepts a non-medication product without any pharmacological field", () => {
    const result = productInputSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toMatchObject({
      commercialName: "Cepillo dental",
      activeIngredient: null,
      concentration: null,
      pharmaceuticalForm: null,
      barcode: null,
      minStock: 0,
      maxStock: null,
      costPrice: "0.00",
      salePrice: null,
      usualSupplierId: null,
      status: "ACTIVE",
    });
  });

  it("turns empty strings from the form into null", () => {
    const result = productInputSchema.parse({ ...base, activeIngredient: "", barcode: "  ", salePrice: "", maxStock: "" });
    expect(result.activeIngredient).toBeNull();
    expect(result.barcode).toBeNull();
    expect(result.salePrice).toBeNull();
    expect(result.maxStock).toBeNull();
  });

  it("requires name, category and unit with Spanish messages", () => {
    const errors = fieldErrors({ commercialName: "  " });
    expect(errors.commercialName).toEqual(["Ingresá el nombre comercial."]);
    expect(errors.categoryId).toEqual(["Elegí una categoría."]);
    expect(errors.unitId).toEqual(["Elegí una unidad."]);
  });

  it("normalizes a scanned barcode and money with a decimal comma", () => {
    const result = productInputSchema.parse({ ...base, barcode: " 7790001234567\r\n", costPrice: "1250,5", salePrice: "99" });
    expect(result.barcode).toBe("7790001234567");
    expect(result.costPrice).toBe("1250.50");
    expect(result.salePrice).toBe("99.00");
  });

  it("rejects invalid numbers and money", () => {
    const errors = fieldErrors({ ...base, minStock: "-1", salePrice: "abc", costPrice: "1.234,56" });
    expect(errors.minStock).toBeDefined();
    expect(errors.salePrice).toBeDefined();
    expect(errors.costPrice).toBeDefined();
  });

  it("rejects a maximum stock below the minimum", () => {
    expect(fieldErrors({ ...base, minStock: "10", maxStock: "5" }).maxStock).toEqual([
      "El stock máximo no puede ser menor que el mínimo.",
    ]);
    expect(fieldErrors({ ...base, minStock: "10", maxStock: "10" })).toEqual({});
  });

  it("does not let the form set ARCHIVED", () => {
    expect(fieldErrors({ ...base, status: "ARCHIVED" }).status).toBeDefined();
    expect(productInputSchema.parse({ ...base, status: "INACTIVE" }).status).toBe("INACTIVE");
  });

  it("validates ids and the optional code format", () => {
    expect(fieldErrors({ ...base, categoryId: "no-uuid" }).categoryId).toBeDefined();
    expect(fieldErrors({ ...base, usualSupplierId: "nope" }).usualSupplierId).toBeDefined();
    expect(fieldErrors({ ...base, code: "bad code!" }).code).toBeDefined();
    expect(productInputSchema.parse({ ...base, code: "MED-001" }).code).toBe("MED-001");
  });
});
