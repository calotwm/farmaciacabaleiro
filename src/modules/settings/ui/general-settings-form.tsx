"use client";

import { useActionState } from "react";
import { FormBanner } from "@/components/form-banner";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { type FormState, initialFormState } from "@/shared/application/form-state";
import { type GeneralSettings, formatThresholds } from "../domain/general-settings";
import { updateExpirySettingsAction, updateGeneralSettingsAction } from "./general-settings-actions";

function SaveButton({ pending }: { pending: boolean }) {
  return (
    <div>
      <Button type="submit" disabled={pending}>
        {pending ? "Guardando..." : "Guardar"}
      </Button>
    </div>
  );
}

/** Pharmacy name, currency and the default minimum stock of new products. */
export function GeneralSettingsForm({ settings }: { settings: GeneralSettings }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(updateGeneralSettingsAction, initialFormState);
  const defaults: Record<string, string> = {
    pharmacyName: settings.pharmacyName,
    defaultMinStock: String(settings.defaultMinStock),
    currency: settings.currency,
    ...state.values,
  };
  const errors = state.fieldErrors ?? {};
  const field = (name: string) => ({ name, defaultValue: defaults[name] ?? "", errors: errors[name] });

  return (
    <form action={formAction} className="bg-card grid max-w-xl gap-4 rounded-xl border p-5" noValidate>
      <FormBanner error={state.error} success={state.success} />
      <FormField {...field("pharmacyName")} label="Nombre de la farmacia" required />
      <FormField
        {...field("currency")}
        label="Moneda"
        hint="Código de 3 letras, por ejemplo ARS. Se usa para mostrar costos y precios."
        maxLength={3}
        required
      />
      <FormField
        {...field("defaultMinStock")}
        label="Stock mínimo por defecto"
        hint="Valor inicial del stock mínimo al crear un producto nuevo; se puede cambiar producto por producto."
        type="number"
        min={0}
        step={1}
        required
      />
      <SaveButton pending={pending} />
    </form>
  );
}

/** The expiry alert thresholds (days before expiry). */
export function ExpirySettingsForm({ settings }: { settings: GeneralSettings }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(updateExpirySettingsAction, initialFormState);
  const value = state.values?.expiryThresholds ?? formatThresholds(settings.expiryThresholds);

  return (
    <form action={formAction} className="bg-card grid max-w-xl gap-4 rounded-xl border p-5" noValidate>
      <FormBanner error={state.error} success={state.success} />
      <FormField
        name="expiryThresholds"
        defaultValue={value}
        errors={state.fieldErrors?.expiryThresholds}
        label="Alertas de vencimiento (días antes)"
        hint="Lista separada por comas, por ejemplo 180, 90, 60, 30, 7. El plazo más grande define cuándo un lote pasa a por vencer."
        inputMode="numeric"
        required
      />
      <SaveButton pending={pending} />
    </form>
  );
}
