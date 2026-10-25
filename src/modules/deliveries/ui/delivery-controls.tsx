"use client";

import { useActionState, useEffect, useTransition } from "react";
import { toast } from "sonner";
import { FormBanner } from "@/components/form-banner";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { type FormState, initialFormState } from "@/shared/application/form-state";
import { type DeliveryStatus, type DeliveryType, allowedTransitions } from "../domain/delivery-status";
import { cancelDeliveryAction, completeDeliveryAction, confirmDeliveryAction, rescheduleDeliveryAction } from "./delivery-actions";

interface DeliveryControlsProps {
  deliveryId: string;
  status: DeliveryStatus;
  type: DeliveryType;
  /** Today in the pharmacy timezone (calendar date), the minimum of the new date. */
  today: string;
}

/**
 * Status actions of an open delivery. Which buttons show comes from the same status machine the server
 * enforces. RECEIVED is not here: a delivery is received through a receipt.
 */
export function DeliveryControls({ deliveryId, status, type, today }: DeliveryControlsProps) {
  const allowed = allowedTransitions(status, type);
  const [pending, startTransition] = useTransition();
  const [rescheduleState, rescheduleAction, rescheduling] = useActionState<FormState, FormData>(rescheduleDeliveryAction, initialFormState);
  const [cancelState, cancelAction, cancelling] = useActionState<FormState, FormData>(cancelDeliveryAction, initialFormState);

  useEffect(() => {
    if (cancelState.success) toast.success(cancelState.success);
  }, [cancelState]);

  if (allowed.length === 0) return null;

  function run(action: (id: string) => Promise<FormState>) {
    startTransition(async () => {
      const result = await action(deliveryId);
      if (result.error) toast.error(result.error);
      else if (result.success) toast.success(result.success);
    });
  }

  const rescheduleErrors = rescheduleState.fieldErrors ?? {};
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        {allowed.includes("CONFIRMED") ? (
          <Button type="button" onClick={() => run(confirmDeliveryAction)} disabled={pending}>
            Confirmar con el proveedor
          </Button>
        ) : null}
        {allowed.includes("COMPLETED") ? (
          <Button type="button" onClick={() => run(completeDeliveryAction)} disabled={pending}>
            Marcar como realizada
          </Button>
        ) : null}
      </div>

      {allowed.includes("RESCHEDULED") ? (
        <details className="max-w-xl rounded-md border p-3" open={!!rescheduleState.error}>
          <summary className="cursor-pointer text-sm font-medium">Reprogramar</summary>
          <form action={rescheduleAction} className="mt-3 grid gap-3" noValidate aria-label="Reprogramar">
            <p className="text-muted-foreground text-sm">Se crea una nueva entrega con la fecha elegida y esta queda como reprogramada.</p>
            <FormBanner error={rescheduleState.error} />
            <input type="hidden" name="id" value={deliveryId} />
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField name="date" type="date" label="Nueva fecha" min={today} defaultValue={rescheduleState.values?.date ?? ""} errors={rescheduleErrors.date} required />
              <FormField name="time" type="time" label="Nueva hora" defaultValue={rescheduleState.values?.time ?? "09:00"} errors={rescheduleErrors.time} required />
            </div>
            <FormField name="reason" label="Motivo (opcional)" defaultValue={rescheduleState.values?.reason ?? ""} errors={rescheduleErrors.reason} />
            <Button type="submit" disabled={rescheduling} className="w-fit">
              {rescheduling ? "Reprogramando..." : "Reprogramar"}
            </Button>
          </form>
        </details>
      ) : null}

      {allowed.includes("CANCELLED") ? (
        <details className="max-w-xl rounded-md border p-3" open={!!cancelState.error}>
          <summary className="cursor-pointer text-sm font-medium">Cancelar</summary>
          <form
            action={cancelAction}
            className="mt-3 grid gap-3"
            noValidate
            aria-label="Cancelar"
            onSubmit={(event) => {
              if (!window.confirm("¿Cancelar esta entrega? No se puede deshacer.")) event.preventDefault();
            }}
          >
            <FormBanner error={cancelState.error} />
            <input type="hidden" name="id" value={deliveryId} />
            <div className="grid gap-2">
              <Label htmlFor="cancel-reason">Motivo (opcional)</Label>
              <Textarea id="cancel-reason" name="reason" defaultValue={cancelState.values?.reason ?? ""} />
            </div>
            <Button type="submit" variant="destructive" disabled={cancelling} className="w-fit">
              {cancelling ? "Cancelando..." : "Cancelar entrega"}
            </Button>
          </form>
        </details>
      ) : null}
    </div>
  );
}
