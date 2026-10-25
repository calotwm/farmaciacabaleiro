import { z } from "zod";
import {
  MANUAL_ISSUE_TYPES,
  MAX_ISSUE_DESCRIPTION_LENGTH,
  MAX_RECEIPT_QUANTITY,
  type ManualIssue,
  normalizeReceiptLines,
} from "../domain/receipt";
import type { ReceiptContent } from "./ports";

/**
 * Validation of the receipt editor submission (raw FormData strings -> typed content, Spanish messages).
 * The editor sends its lines and manual issues as JSON fields; state-dependent rules (expired lots, product
 * status, delivery type) are checked by the service inside the transaction.
 */

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} es demasiado largo (máximo ${max} caracteres).`)
    .nullish()
    .transform((value) => (value ? value : null));

/** A cell typed by a person: text or number, never missing. */
const cell = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((value) => (value === null || value === undefined ? "" : String(value)));

const rawLine = z.object({ productId: cell, lotNumber: cell, expiry: cell, quantity: cell, damagedQuantity: cell, unitCost: cell });
const rawIssue = z.object({ type: cell, productId: cell, quantity: cell, description: cell });

function jsonArray<T extends z.ZodType>(schema: T, message: string) {
  return z
    .string()
    .nullish()
    .transform((value, ctx): unknown => {
      if (!value?.trim()) return [];
      try {
        return JSON.parse(value);
      } catch {
        ctx.issues.push({ code: "custom", message, input: value });
        return [];
      }
    })
    .pipe(z.array(schema));
}

function normalizeManualIssues(raw: ReadonlyArray<z.output<typeof rawIssue>>): { issues: ManualIssue[]; errors: string[] } {
  const issues: ManualIssue[] = [];
  const errors: string[] = [];
  raw.forEach((item, index) => {
    const problems: string[] = [];
    const type = (MANUAL_ISSUE_TYPES as readonly string[]).includes(item.type) ? (item.type as ManualIssue["type"]) : null;
    if (!type) problems.push("elegí el tipo de problema");
    const description = item.description.trim();
    if (!description) problems.push("describí el problema");
    else if (description.length > MAX_ISSUE_DESCRIPTION_LENGTH) problems.push(`la descripción es demasiado larga (máximo ${MAX_ISSUE_DESCRIPTION_LENGTH} caracteres)`);
    const productId = item.productId.trim();
    if (productId && !z.uuid().safeParse(productId).success) problems.push("el producto no es válido");
    const quantityText = item.quantity.trim();
    const quantity = quantityText === "" ? null : /^\d{1,9}$/.test(quantityText) ? Number(quantityText) : Number.NaN;
    if (quantity !== null && !(quantity >= 1 && quantity <= MAX_RECEIPT_QUANTITY)) problems.push("la cantidad debe ser un entero mayor que cero");
    if (problems.length > 0 || !type) {
      errors.push(`Problema ${index + 1}: ${problems.join("; ")}.`);
      return;
    }
    issues.push({ type, productId: productId || null, quantity, description });
  });
  return { issues, errors };
}

export const receiptContentSchema = z
  .object({
    invoiceNumber: optionalText(60, "El número de factura o remito"),
    notes: optionalText(2000, "Las notas"),
    isPartial: z
      .string()
      .nullish()
      .transform((value) => value === "on" || value === "true"),
    lines: jsonArray(rawLine, "Revisá las líneas de la recepción."),
    issues: jsonArray(rawIssue, "Revisá los problemas registrados."),
  })
  .transform((value, ctx): ReceiptContent => {
    const { lines, errors: lineErrors } = normalizeReceiptLines(value.lines);
    const { issues, errors: issueErrors } = normalizeManualIssues(value.issues);
    for (const message of lineErrors) ctx.issues.push({ code: "custom", message, input: value, path: ["lines"] });
    for (const message of issueErrors) ctx.issues.push({ code: "custom", message, input: value, path: ["issues"] });
    return { invoiceNumber: value.invoiceNumber, notes: value.notes, isPartial: value.isPartial, lines, manualIssues: issues };
  });

const optionalId = (message: string) =>
  z
    .string()
    .trim()
    .nullish()
    .transform((value) => value || null)
    .pipe(z.uuid({ error: message }).nullable());

/** A receipt starts from a scheduled delivery or, without one, from a supplier. */
export const startReceiptSchema = z
  .object({ deliveryId: optionalId("Elegí una entrega válida."), supplierId: optionalId("Elegí un proveedor válido.") })
  .refine((value) => !!value.deliveryId || !!value.supplierId, { path: ["supplierId"], message: "Elegí un proveedor." });
