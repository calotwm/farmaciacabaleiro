"use client";

import { useActionState } from "react";
import { FormBanner } from "@/components/form-banner";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { type FormState, initialFormState } from "@/shared/application/form-state";
import { type GeneralSettings, formatThresholds } from "../domain/general-settings";
import { updateGeneralSettingsAction } from "./general-settings-actions";

export function GeneralSettingsForm({ settings }: { settings: GeneralSettings }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(updateGeneralSettingsAction, initialFormState);
  const defaults: Record<string, string> = {
    pharmacyName: settings.pharmacyName,
    expiryThresholds: formatThresholds(settings.expiryThresholds),
    defaultMinStock: String(settings.defaultMinStock),
    currency: settings.currency,
    ...state.values,
  };
  const errors = state.fieldErrors ?? {};
  const field = (name: string) => ({ name, defaultValue: defaults[name] ?? "", errors: errors[name] });

  return (
    <form action={formAction} className="grid max-w-xl gap-4" noValidate>
      <FormBanner error={state.error} success={state.success} />
      <FormField {...field("pharmacyName")} label="Nombre de la farmacia" required />
      <FormField
        {...field("expiryThresholds")}
        label="Alertas de vencimiento (días antes)"
        hint="Lista separada por comas, por ejemplo 180, 90, 60, 30, 7. El plazo más grande define cuándo un lote pasa a 'por vencer'."
        inputMode="numeric"
        required
      />
      <FormField {...field("defaultMinStock")} label="Stock mínimo por defecto" type="number" min={0} step={1} required />
      <FormField {...field("currency")} label="Moneda" hint="Código de 3 letras, por ejemplo ARS." maxLength={3} required />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando..." : "Guardar"}
        </Button>
      </div>
    </form>
  );
}
