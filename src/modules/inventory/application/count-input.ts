import { z } from "zod";
import { isUuid } from "@/shared/domain/ids";

/** Validation of the stock count forms (raw FormData strings, Spanish messages). */

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} es demasiado largo (máximo ${max} caracteres).`)
    .nullish()
    .transform((value) => (value ? value : null));

const optionalUuid = z
  .string()
  .trim()
  .refine((value) => value === "" || isUuid(value), "Elegí una opción válida.")
  .transform((value) => (value === "" ? null : value))
  .nullish()
  .transform((value) => value ?? null);

export const openCountSchema = z.object({
  categoryId: optionalUuid,
  location: optionalText(120, "La ubicación"),
  notes: optionalText(300, "La nota"),
});

export const closeCountSchema = z
  .object({
    countId: z.string().refine(isUuid, "No se encontró el conteo."),
    reasonId: optionalUuid,
    reasonText: optionalText(500, "El detalle"),
  })
  .refine((value) => !!(value.reasonId || value.reasonText), {
    path: ["reasonId"],
    message: "Elegí un motivo o escribí el detalle: es obligatorio para cerrar el conteo.",
  });

export const MAX_COUNTED_QUANTITY = 10_000_000;
export const COUNT_FIELD_PREFIX = "counted:";
const COUNTED_MESSAGE = "Ingresá un número entero mayor o igual a 0.";

export interface CountEntry {
  lotId: string;
  /** Null clears the line (not counted). */
  countedQuantity: number | null;
}

/** Reads the `counted:<lotId>` inputs of the count form. Blank means "not counted". */
export function parseCountEntries(formData: FormData): { entries: CountEntry[]; fieldErrors: Record<string, string[]> } {
  const entries: CountEntry[] = [];
  const fieldErrors: Record<string, string[]> = {};
  for (const [key, raw] of formData.entries()) {
    if (!key.startsWith(COUNT_FIELD_PREFIX) || typeof raw !== "string") continue;
    const lotId = key.slice(COUNT_FIELD_PREFIX.length);
    const value = raw.trim();
    if (!isUuid(lotId)) continue;
    if (value === "") {
      entries.push({ lotId, countedQuantity: null });
    } else if (/^\d{1,8}$/.test(value) && Number(value) <= MAX_COUNTED_QUANTITY) {
      entries.push({ lotId, countedQuantity: Number(value) });
    } else {
      fieldErrors[key] = [COUNTED_MESSAGE];
    }
  }
  return { entries, fieldErrors };
}
