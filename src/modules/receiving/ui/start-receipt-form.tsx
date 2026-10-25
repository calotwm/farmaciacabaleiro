"use client";

import { useActionState } from "react";
import { FormBanner } from "@/components/form-banner";
import { SelectField, type SelectOption } from "@/components/select-field";
import { Button } from "@/components/ui/button";
import { type FormState, initialFormState } from "@/shared/application/form-state";
import { startReceiptAction } from "./receipt-actions";

/** "Recibir" button of a scheduled delivery: starts (or resumes) its draft receipt. */
export function StartReceiptButton({ deliveryId, label = "Recibir" }: { deliveryId: string; label?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(startReceiptAction, initialFormState);
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="deliveryId" value={deliveryId} />
      <FormBanner error={state.error} />
      <Button type="submit" disabled={pending}>
        {pending ? "Abriendo..." : label}
      </Button>
    </form>
  );
}

/** "Recepción sin programar": pick the supplier and start a draft that has no delivery. */
export function StartUnscheduledReceiptForm({ suppliers }: { suppliers: SelectOption[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(startReceiptAction, initialFormState);
  return (
    <form action={action} className="grid max-w-xl gap-4" noValidate>
      <FormBanner error={state.error} />
      <SelectField
        name="supplierId"
        label="Proveedor"
        options={suppliers}
        placeholder="Elegí un proveedor"
        defaultValue={state.values?.supplierId ?? ""}
        errors={state.fieldErrors?.supplierId}
        required
      />
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Abriendo..." : "Comenzar recepción"}
      </Button>
    </form>
  );
}
