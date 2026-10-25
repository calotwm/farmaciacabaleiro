"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormBanner } from "@/components/form-banner";
import { FormField } from "@/components/form-field";
import { SelectField, type SelectOption } from "@/components/select-field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { type FormState, initialFormState } from "@/shared/application/form-state";
import type { SupplierRecord } from "../application/ports";
import { formatCuit } from "../domain/cuit";
import { SUPPLIER_STATUS_LABELS, WEEKDAYS } from "../domain/supplier";
import { createSupplierAction, updateSupplierAction } from "./supplier-actions";

interface SupplierFormProps {
  /** Present when editing. */
  supplier?: SupplierRecord;
}

function defaultsFrom(supplier?: SupplierRecord): Record<string, string> {
  if (!supplier) return { status: "ACTIVE" };
  return {
    name: supplier.name,
    cuit: supplier.cuit ? formatCuit(supplier.cuit) : "",
    contactName: supplier.contactName ?? "",
    phone: supplier.phone ?? "",
    email: supplier.email ?? "",
    address: supplier.address ?? "",
    visitDays: supplier.visitDays.join(","),
    deliveryHours: supplier.deliveryHours ?? "",
    leadTimeDays: supplier.leadTimeDays === null ? "" : String(supplier.leadTimeDays),
    status: supplier.status,
    notes: supplier.notes ?? "",
  };
}

const STATUS_OPTIONS: SelectOption[] = [
  { value: "ACTIVE", label: SUPPLIER_STATUS_LABELS.ACTIVE },
  { value: "INACTIVE", label: SUPPLIER_STATUS_LABELS.INACTIVE },
];

export function SupplierForm({ supplier }: SupplierFormProps) {
  const isEdit = !!supplier;
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    isEdit ? updateSupplierAction : createSupplierAction,
    initialFormState,
  );
  const defaults = { ...defaultsFrom(supplier), ...state.values };
  const errors = state.fieldErrors ?? {};
  const checkedDays = new Set((defaults.visitDays ?? "").split(",").filter(Boolean));

  function field(name: string) {
    return { name, defaultValue: defaults[name] ?? "", errors: errors[name] };
  }

  return (
    <form action={formAction} className="grid max-w-4xl gap-6" noValidate>
      <FormBanner error={state.error} />
      {isEdit ? <input type="hidden" name="id" value={supplier.id} /> : null}

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-lg font-medium">Datos generales</legend>
        <FormField {...field("name")} label="Nombre" required autoFocus />
        <FormField {...field("cuit")} label="CUIT" placeholder="XX-XXXXXXXX-X" hint="Opcional. Se valida el dígito verificador." inputMode="numeric" />
        <FormField {...field("contactName")} label="Contacto" />
        <FormField {...field("phone")} label="Teléfono" type="tel" />
        <FormField {...field("email")} label="Email" type="email" />
        <FormField {...field("address")} label="Dirección" />
        <SelectField {...field("status")} label="Estado" options={STATUS_OPTIONS} />
      </fieldset>

      <fieldset className="grid gap-4">
        <legend className="mb-2 text-lg font-medium">Entregas</legend>
        <div className="grid gap-2">
          <p id="visitDays-legend" className="text-sm font-medium">
            Días de visita
          </p>
          <div role="group" aria-labelledby="visitDays-legend" className="flex flex-wrap gap-2">
            {WEEKDAYS.map((day) => (
              <label
                key={day.value}
                className="has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:focus-visible]:ring-ring/50 flex cursor-pointer items-center rounded-md border px-3 py-2 text-sm has-[:focus-visible]:ring-[3px]"
              >
                <input type="checkbox" name="visitDays" value={day.value} defaultChecked={checkedDays.has(String(day.value))} className="sr-only" />
                {day.label}
              </label>
            ))}
          </div>
          {errors.visitDays ? (
            <p role="alert" className="text-destructive text-sm">
              {errors.visitDays.join(" ")}
            </p>
          ) : null}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField {...field("deliveryHours")} label="Horario de entrega" hint="Por ejemplo: 8 a 12 hs." />
          <FormField {...field("leadTimeDays")} label="Plazo de entrega (días)" inputMode="numeric" hint="Días entre el pedido y la entrega." />
        </div>
      </fieldset>

      <div className="grid gap-2">
        <Label htmlFor="notes">Notas</Label>
        <Textarea id="notes" name="notes" defaultValue={defaults.notes ?? ""} aria-invalid={errors.notes ? true : undefined} />
        {errors.notes ? (
          <p role="alert" className="text-destructive text-sm">
            {errors.notes.join(" ")}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear proveedor"}
        </Button>
        <Button asChild variant="outline">
          <Link href={isEdit ? `/proveedores/${supplier.id}` : "/proveedores"}>Cancelar</Link>
        </Button>
      </div>
    </form>
  );
}
