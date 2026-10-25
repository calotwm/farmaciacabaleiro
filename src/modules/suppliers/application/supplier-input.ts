import { z } from "zod";
import { isValidCuit, normalizeCuit } from "../domain/cuit";
import { SUPPLIER_STATUSES, normalizeVisitDays } from "../domain/supplier";
import type { SupplierData } from "./ports";

/** Validation of the supplier form (raw FormData strings -> typed data, Spanish messages). */

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} es demasiado largo (máximo ${max} caracteres).`)
    .nullish()
    .transform((value) => (value ? value : null));

const MAX_LEAD_TIME_DAYS = 365;

export const supplierInputSchema = z.object({
  name: z
    .string({ error: "Ingresá el nombre del proveedor." })
    .trim()
    .min(1, "Ingresá el nombre del proveedor.")
    .max(200, "El nombre es demasiado largo (máximo 200 caracteres)."),
  cuit: z
    .string()
    .trim()
    .nullish()
    .transform((value) => value ?? "")
    .refine((value) => value === "" || isValidCuit(value), "El CUIT no es válido: revisá los 11 dígitos (formato XX-XXXXXXXX-X).")
    .transform((value) => (value === "" ? null : normalizeCuit(value))),
  contactName: optionalText(120, "El contacto"),
  phone: optionalText(60, "El teléfono"),
  email: z
    .string()
    .trim()
    .max(200, "El email es demasiado largo (máximo 200 caracteres).")
    .nullish()
    .transform((value) => value ?? "")
    .refine((value) => value === "" || z.email().safeParse(value).success, "Ingresá un email válido.")
    .transform((value) => (value === "" ? null : value)),
  address: optionalText(300, "La dirección"),
  visitDays: z
    .array(z.string())
    .default([])
    .transform((values) => normalizeVisitDays(values.map(Number))),
  deliveryHours: optionalText(120, "El horario de entrega"),
  leadTimeDays: z
    .string()
    .trim()
    .nullish()
    .transform((value) => value ?? "")
    .refine(
      (value) => value === "" || (/^\d{1,3}$/.test(value) && Number(value) <= MAX_LEAD_TIME_DAYS),
      `Ingresá un número entero de días entre 0 y ${MAX_LEAD_TIME_DAYS}.`,
    )
    .transform((value) => (value === "" ? null : Number(value))),
  status: z.enum(SUPPLIER_STATUSES, { error: "Elegí un estado válido." }).default("ACTIVE"),
  notes: optionalText(2000, "Las notas"),
});

export type SupplierInput = z.output<typeof supplierInputSchema>;

export function toSupplierData(input: SupplierInput): SupplierData {
  return { ...input };
}
