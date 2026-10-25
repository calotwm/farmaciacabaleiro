import { z } from "zod";
import { type CalendarDate, expiryFromMonthYear, parseDisplayDate } from "@/shared/domain/dates";
import { MAX_MOVEMENT_QUANTITY } from "../domain/movement-rules";

/**
 * Validation of the "Nuevo movimiento" form (raw FormData strings -> a typed command, Spanish messages).
 * The stock service re-checks everything that depends on state; this only covers the shape.
 */

const QUANTITY_MESSAGE = `Ingresá una cantidad entera entre 1 y ${MAX_MOVEMENT_QUANTITY.toLocaleString("es-AR")}.`;

const quantity = z
  .string({ error: QUANTITY_MESSAGE })
  .trim()
  .regex(/^\d{1,9}$/, QUANTITY_MESSAGE)
  .transform(Number)
  .refine((value) => value >= 1 && value <= MAX_MOVEMENT_QUANTITY, QUANTITY_MESSAGE);

const optionalQuantity = z
  .string()
  .trim()
  .refine((value) => value === "" || (/^\d{1,9}$/.test(value) && Number(value) >= 1 && Number(value) <= MAX_MOVEMENT_QUANTITY), QUANTITY_MESSAGE)
  .transform((value) => (value === "" ? null : Number(value)))
  .nullish()
  .transform((value) => value ?? null);

/** Block/unblock by units needs a count; the whole-lot modes ignore it. */
const unitsNeedQuantity = (value: { mode: string; quantity: number | null }) => value.mode !== "UNITS" || value.quantity !== null;

const uuid = (empty: string) => z.string({ error: empty }).trim().min(1, empty).pipe(z.uuid(empty));

const optionalUuid = z
  .string()
  .trim()
  .refine((value) => value === "" || z.uuid().safeParse(value).success, "Elegí una opción válida.")
  .transform((value) => (value === "" ? null : value))
  .nullish()
  .transform((value) => value ?? null);

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} es demasiado largo (máximo ${max} caracteres).`)
    .nullish()
    .transform((value) => (value ? value : null));

const optionalMoney = z
  .string()
  .trim()
  .refine((value) => value === "" || /^\d{1,10}([.,]\d{1,2})?$/.test(value), "Ingresá un importe válido (por ejemplo 1250,50).")
  .transform((value) => {
    if (value === "") return null;
    const [integer, decimals = ""] = value.replace(",", ".").split(".");
    return `${integer}.${decimals.padEnd(2, "0")}`;
  })
  .nullish()
  .transform((value) => value ?? null);

/** DD/MM/AAAA (exact day) or MM/AAAA (last day of the month). */
export function parseExpiryInput(raw: string): CalendarDate | null {
  return parseDisplayDate(raw) ?? expiryFromMonthYear(raw);
}

const expiry = z
  .string({ error: "Ingresá la fecha de vencimiento." })
  .trim()
  .min(1, "Ingresá la fecha de vencimiento.")
  .transform((value, ctx) => {
    const parsed = parseExpiryInput(value);
    if (!parsed) ctx.issues.push({ code: "custom", message: "Ingresá la fecha como DD/MM/AAAA o MM/AAAA.", input: value });
    return parsed ?? "";
  });

const productId = uuid("Elegí un producto.");
const reason = {
  reasonId: optionalUuid,
  reasonText: optionalText(500, "El detalle"),
};

const REASON_MESSAGE = "Elegí un motivo o escribí el detalle.";
const needsReason = (value: { reasonId: string | null; reasonText: string | null }) => !!(value.reasonId || value.reasonText);

const entry = z.object({
  type: z.literal("ENTRY"),
  productId,
  quantity,
  lotNumber: z.string({ error: "Ingresá el número de lote." }).trim().min(1, "Ingresá el número de lote.").max(60, "El número de lote es demasiado largo."),
  expiryDate: expiry,
  unitCost: optionalMoney,
  supplierId: optionalUuid,
  invoiceNumber: optionalText(60, "El número de factura"),
  location: optionalText(120, "La ubicación"),
  notes: optionalText(500, "Las notas"),
  ...reason,
});

const exit = z.object({
  type: z.literal("EXIT"),
  productId,
  quantity,
  lotId: optionalUuid,
  ...reason,
});

const lotRemoval = (type: "ADJUSTMENT_IN" | "ADJUSTMENT_OUT" | "RETURN" | "WRITE_OFF") =>
  z
    .object({ type: z.literal(type), productId, lotId: uuid("Elegí un lote."), quantity, ...reason })
    .refine(needsReason, { path: ["reasonId"], message: REASON_MESSAGE });

const block = z
  .object({
    type: z.literal("BLOCK"),
    productId,
    lotId: uuid("Elegí un lote."),
    mode: z.enum(["UNITS", "QUARANTINE", "BLOCKED"], { error: "Elegí qué bloquear." }),
    quantity: optionalQuantity,
    ...reason,
  })
  .refine(needsReason, { path: ["reasonId"], message: REASON_MESSAGE })
  .refine(unitsNeedQuantity, { path: ["quantity"], message: QUANTITY_MESSAGE });

const unblock = z
  .object({
    type: z.literal("UNBLOCK"),
    productId,
    lotId: uuid("Elegí un lote."),
    mode: z.enum(["UNITS", "LOT"], { error: "Elegí qué desbloquear." }),
    quantity: optionalQuantity,
    ...reason,
  })
  .refine(needsReason, { path: ["reasonId"], message: REASON_MESSAGE })
  .refine(unitsNeedQuantity, { path: ["quantity"], message: QUANTITY_MESSAGE });

export const movementInputSchema = z.discriminatedUnion("type", [
  entry,
  exit,
  lotRemoval("ADJUSTMENT_IN"),
  lotRemoval("ADJUSTMENT_OUT"),
  lotRemoval("RETURN"),
  lotRemoval("WRITE_OFF"),
  block,
  unblock,
]);

export type MovementCommand = z.output<typeof movementInputSchema>;
