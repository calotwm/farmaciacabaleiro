import { z } from "zod";

export { productInputSchema } from "../application/product-input";

const kind = z.enum(["category", "unit"]);

const name = z
  .string({ error: "Ingresá el nombre." })
  .trim()
  .min(1, "Ingresá el nombre.")
  .max(80, "El nombre no puede superar los 80 caracteres.");

export const createTaxonomySchema = z.object({ kind, name });
export const renameTaxonomySchema = z.object({ kind, id: z.uuid(), name });
export const setTaxonomyActiveSchema = z.object({ kind, id: z.uuid(), active: z.enum(["true", "false"]) });
export const deleteTaxonomySchema = z.object({ kind, id: z.uuid() });

export const productIdSchema = z.uuid();
