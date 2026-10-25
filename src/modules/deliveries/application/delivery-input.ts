import { z } from "zod";
import { isValidCalendarDate, isValidTime, zonedInstant } from "@/shared/domain/dates";
import { DELIVERY_TYPES } from "../domain/delivery-status";
import type { DeliveryData, DeliveryEditData, ExpectedItemData } from "./ports";

/**
 * Validation of the delivery forms (raw FormData strings -> typed data, Spanish messages). The date and
 * time are entered in AR time and combined into one instant here; the services re-check state.
 */

export const MAX_EXPECTED_QUANTITY = 1_000_000;

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} es demasiado largo (máximo ${max} caracteres).`)
    .nullish()
    .transform((value) => (value ? value : null));

const optionalUuid = (message: string) =>
  z
    .string()
    .trim()
    .nullish()
    .transform((value) => value ?? "")
    .refine((value) => value === "" || z.uuid().safeParse(value).success, message)
    .transform((value) => (value === "" ? null : value));

const requiredUuid = (empty: string, invalid: string) => z.string({ error: empty }).trim().min(1, empty).pipe(z.uuid(invalid));

const date = z.string({ error: "Elegí la fecha." }).trim().refine(isValidCalendarDate, "Ingresá una fecha válida.");
const time = z.string({ error: "Elegí la hora." }).trim().refine(isValidTime, "Ingresá la hora como HH:mm.");

const ITEMS_MESSAGE = "Revisá los productos esperados: cada uno necesita una cantidad entera entre 1 y 1.000.000, sin repetir productos.";

const itemsSchema = z
  .array(z.object({ productId: z.uuid(), quantity: z.number().int().min(1).max(MAX_EXPECTED_QUANTITY) }))
  .refine((items) => new Set(items.map((item) => item.productId)).size === items.length, ITEMS_MESSAGE);

/** The expected products travel as one JSON field (`[{ productId, quantity }]`) built by the form. */
const items = z
  .string()
  .nullish()
  .transform((value, ctx): unknown => {
    if (!value?.trim()) return [];
    try {
      return JSON.parse(value);
    } catch {
      ctx.issues.push({ code: "custom", message: ITEMS_MESSAGE, input: value });
      return [];
    }
  })
  .pipe(itemsSchema)
  .transform((value): ExpectedItemData[] => value.map((item) => ({ productId: item.productId, expectedQuantity: item.quantity })));

const common = {
  type: z.enum(DELIVERY_TYPES, { error: "Elegí el tipo de visita." }),
  orderNumber: optionalText(60, "El número de pedido"),
  responsibleUserId: optionalUuid("Elegí un responsable válido."),
  notes: optionalText(2000, "Las notas"),
  items,
};

export const createDeliverySchema = z
  .object({
    supplierId: requiredUuid("Elegí un proveedor.", "Elegí un proveedor válido."),
    date,
    time,
    ...common,
  })
  .transform(({ date: day, time: at, items: expectedItems, ...rest }): DeliveryData => ({
    ...rest,
    scheduledAt: zonedInstant(day, at),
    expectedItems,
  }));

export const editDeliverySchema = z
  .object({ ...common })
  .transform(({ items: expectedItems, ...rest }): DeliveryEditData => ({ ...rest, expectedItems }));

export const rescheduleDeliverySchema = z
  .object({
    date,
    time,
    reason: optionalText(500, "El motivo"),
  })
  .transform(({ date: day, time: at, reason }) => ({ scheduledAt: zonedInstant(day, at), reason }));

export const cancelDeliverySchema = z.object({ reason: optionalText(500, "El motivo") });

export type CreateDeliveryInput = z.output<typeof createDeliverySchema>;
export type EditDeliveryInput = z.output<typeof editDeliverySchema>;
export type RescheduleDeliveryInput = z.output<typeof rescheduleDeliverySchema>;
