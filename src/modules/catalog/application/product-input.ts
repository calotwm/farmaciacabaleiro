import { z } from "zod";
import { normalizeBarcode } from "@/shared/domain/barcode";
import { EDITABLE_PRODUCT_STATUSES } from "../domain/product";
import type { ProductData } from "./ports";

/**
 * Validation of the product form (raw FormData strings -> typed data, Spanish messages).
 * Pharmacological fields are optional: a non-medication product only needs name, category and unit.
 */

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} es demasiado largo (máximo ${max} caracteres).`)
    .nullish()
    .transform((value) => (value ? value : null));

const optionalInteger = (message: string) =>
  z
    .string()
    .trim()
    .refine((value) => value === "" || /^\d{1,9}$/.test(value), message)
    .transform((value) => (value === "" ? null : Number(value)))
    .nullish()
    .transform((value) => value ?? null);

const MONEY_MESSAGE = "Ingresá un importe válido (por ejemplo 1250,50).";

/** "1250,5" -> "1250.50". Accepts comma or dot as decimal separator, up to 2 decimals. */
function normalizeMoney(value: string): string {
  const [integer, decimals = ""] = value.replace(",", ".").split(".");
  return `${integer}.${decimals.padEnd(2, "0")}`;
}

const optionalMoney = z
  .string()
  .trim()
  .refine((value) => value === "" || /^\d{1,10}([.,]\d{1,2})?$/.test(value), MONEY_MESSAGE)
  .transform((value) => (value === "" ? null : normalizeMoney(value)))
  .nullish()
  .transform((value) => value ?? null);

const optionalUuid = (message: string) =>
  z
    .string()
    .trim()
    .refine((value) => value === "" || z.uuid().safeParse(value).success, message)
    .transform((value) => (value === "" ? null : value))
    .nullish()
    .transform((value) => value ?? null);

const requiredUuid = (empty: string, invalid: string) =>
  z.string({ error: empty }).trim().min(1, empty).pipe(z.uuid(invalid));

export const productInputSchema = z
  .object({
    code: z
      .string()
      .trim()
      .refine((value) => value === "" || /^[A-Za-z0-9._-]{1,40}$/.test(value), "Usá letras, números, punto, guion o guion bajo (máximo 40).")
      .nullish()
      .transform((value) => (value ? value : null)),
    commercialName: z
      .string({ error: "Ingresá el nombre comercial." })
      .trim()
      .min(1, "Ingresá el nombre comercial.")
      .max(200, "El nombre comercial es demasiado largo (máximo 200 caracteres)."),
    activeIngredient: optionalText(200, "El principio activo"),
    brand: optionalText(120, "La marca"),
    laboratory: optionalText(120, "El laboratorio"),
    barcode: z
      .string()
      .nullish()
      .transform((value) => normalizeBarcode(value ?? ""))
      .refine((value) => value.length <= 64, "El código de barras es demasiado largo (máximo 64 caracteres).")
      .transform((value) => (value ? value : null)),
    sku: optionalText(64, "El SKU"),
    categoryId: requiredUuid("Elegí una categoría.", "Elegí una categoría válida."),
    presentation: optionalText(120, "La presentación"),
    concentration: optionalText(120, "La concentración"),
    pharmaceuticalForm: optionalText(120, "La forma farmacéutica"),
    contentPerPackage: optionalText(120, "El contenido por envase"),
    unitId: requiredUuid("Elegí una unidad.", "Elegí una unidad válida."),
    minStock: optionalInteger("Ingresá un número entero mayor o igual a 0.").transform((value) => value ?? 0),
    maxStock: optionalInteger("Ingresá un número entero mayor o igual a 0."),
    costPrice: optionalMoney.transform((value) => value ?? "0.00"),
    salePrice: optionalMoney,
    usualSupplierId: optionalUuid("Elegí un proveedor válido."),
    location: optionalText(120, "La ubicación"),
    status: z.enum(EDITABLE_PRODUCT_STATUSES, { error: "Elegí un estado válido." }).default("ACTIVE"),
    notes: optionalText(2000, "Las notas"),
  })
  .refine((value) => value.maxStock === null || value.maxStock >= value.minStock, {
    path: ["maxStock"],
    message: "El stock máximo no puede ser menor que el mínimo.",
  });

export type ProductInput = z.output<typeof productInputSchema>;

/** `code` is optional in the form; the service fills it in when empty. */
export function toProductData(input: ProductInput, code: string): ProductData {
  return { ...input, code };
}
