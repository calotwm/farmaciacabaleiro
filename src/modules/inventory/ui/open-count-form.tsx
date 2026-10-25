"use client";

import { useActionState } from "react";
import { FormBanner } from "@/components/form-banner";
import { FormField } from "@/components/form-field";
import { SelectField, type SelectOption } from "@/components/select-field";
import { Button } from "@/components/ui/button";
import { type FormState, initialFormState } from "@/shared/application/form-state";
import { openCountAction } from "./count-actions";

export function OpenCountForm({ categories }: { categories: SelectOption[] }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(openCountAction, initialFormState);
  const errors = state.fieldErrors ?? {};
  const values = state.values ?? {};

  return (
    <form action={formAction} className="grid max-w-3xl gap-4 sm:grid-cols-2" noValidate aria-label="Abrir un conteo">
      <div className="sm:col-span-2">
        <FormBanner error={state.error} />
      </div>
      <SelectField
        name="categoryId"
        label="Categoría"
        options={categories}
        placeholder="Todas las categorías"
        defaultValue={values.categoryId ?? ""}
        errors={errors.categoryId}
      />
      <FormField
        name="location"
        label="Ubicación"
        defaultValue={values.location ?? ""}
        errors={errors.location}
        hint="Opcional: solo lotes cuya ubicación contenga este texto."
      />
      <div className="sm:col-span-2">
        <FormField name="notes" label="Nota" defaultValue={values.notes ?? ""} errors={errors.notes} />
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Abriendo..." : "Abrir conteo"}
        </Button>
      </div>
    </form>
  );
}
