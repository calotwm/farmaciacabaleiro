import { z } from "zod";
import { parseThresholds } from "../domain/general-settings";

/** Form input: thresholds arrive as a comma list ("180, 90, 30") and leave as numbers, largest first. */
export const generalSettingsSchema = z.object({
  pharmacyName: z
    .string({ error: "Ingresá el nombre de la farmacia." })
    .trim()
    .min(1, "Ingresá el nombre de la farmacia.")
    .max(120, "El nombre no puede superar los 120 caracteres."),
  expiryThresholds: z
    .string({ error: "Ingresá al menos un plazo." })
    .transform((value, ctx) => {
      const parsed = parseThresholds(value);
      if (!parsed) ctx.addIssue({ code: "custom", message: "Ingresá días enteros positivos separados por coma (por ejemplo 180, 90, 30)." });
      return parsed ?? [];
    }),
  defaultMinStock: z.coerce
    .number({ error: "Ingresá un número." })
    .int("Ingresá un número entero.")
    .min(0, "No puede ser negativo.")
    .max(1_000_000, "El valor es demasiado grande."),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Ingresá un código de moneda de 3 letras (por ejemplo ARS)."),
});

export type GeneralSettingsInput = z.infer<typeof generalSettingsSchema>;
