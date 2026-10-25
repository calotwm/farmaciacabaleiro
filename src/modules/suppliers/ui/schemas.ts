import { z } from "zod";

export { supplierInputSchema } from "../application/supplier-input";

export const supplierIdSchema = z.uuid();
export const supplierProductSchema = z.object({ supplierId: z.uuid(), productId: z.uuid() });
