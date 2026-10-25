"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { FormBanner } from "@/components/form-banner";
import { FormField } from "@/components/form-field";
import { SelectField, type SelectOption } from "@/components/select-field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ProductPicker } from "@/modules/catalog/ui/product-picker";
import type { ProductHit } from "@/modules/catalog/ui/product-search-actions";
import { type FormState, initialFormState } from "@/shared/application/form-state";
import { formatDateTime } from "@/shared/domain/dates";
import type { DeliveryRecord } from "../application/ports";
import { DELIVERY_TYPES, DELIVERY_TYPE_LABELS, type DeliveryType, isGoodsDelivery } from "../domain/delivery-status";
import { createDeliveryAction, updateDeliveryAction } from "./delivery-actions";

interface DeliveryFormProps {
  suppliers: SelectOption[];
  users: SelectOption[];
  /** Present when editing: supplier and date are fixed (a new date is a reschedule). */
  delivery?: DeliveryRecord;
  defaultSupplierId?: string;
  /** Today in the pharmacy timezone (calendar date), the default of the date field. */
  today: string;
  defaultResponsibleId?: string;
}

interface ItemRow {
  productId: string;
  name: string;
  code: string;
  quantity: string;
}

const TYPE_OPTIONS: SelectOption[] = DELIVERY_TYPES.map((type) => ({ value: type, label: DELIVERY_TYPE_LABELS[type] }));

/** The hidden `items` field: ids and quantities for the server; names only so the form can redraw itself. */
function serializeItems(rows: readonly ItemRow[]): string {
  return JSON.stringify(rows.map((row) => ({ ...row, quantity: /^\d+$/.test(row.quantity.trim()) ? Number(row.quantity) : row.quantity })));
}

export function DeliveryForm({ suppliers, users, delivery, defaultSupplierId, defaultResponsibleId, today }: DeliveryFormProps) {
  const isEdit = !!delivery;
  const [state, formAction, pending] = useActionState<FormState, FormData>(isEdit ? updateDeliveryAction : createDeliveryAction, initialFormState);
  const [items, setItems] = useState<ItemRow[]>(() =>
    (delivery?.expectedItems ?? []).map((item) => ({
      productId: item.productId,
      name: item.productName,
      code: item.productCode,
      quantity: String(item.expectedQuantity),
    })),
  );
  const [type, setType] = useState<string>(delivery?.type ?? "DELIVERY");
  const values = state.values ?? {};
  const errors = state.fieldErrors ?? {};
  const value = (name: string, fallback = "") => values[name] ?? fallback;

  function addItem(product: ProductHit) {
    setItems((current) =>
      current.some((row) => row.productId === product.id)
        ? current
        : [...current, { productId: product.id, name: product.name, code: product.code, quantity: "1" }],
    );
  }

  return (
    <form action={formAction} className="grid max-w-4xl gap-6" noValidate>
      <FormBanner error={state.error} />
      {isEdit ? <input type="hidden" name="id" value={delivery.id} /> : null}
      <input type="hidden" name="items" value={serializeItems(items)} />

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-lg font-medium">Visita</legend>
        {isEdit ? (
          <div className="grid gap-2 sm:col-span-2">
            <p className="text-sm font-medium">Proveedor y fecha</p>
            <p>
              {delivery.supplierName} · {formatDateTime(delivery.scheduledAt)}
            </p>
            <p className="text-muted-foreground text-sm">Para cambiar la fecha usá &quot;Reprogramar&quot;: así se conserva el historial.</p>
          </div>
        ) : (
          <>
            <SelectField
              name="supplierId"
              label="Proveedor"
              options={suppliers}
              placeholder="Elegí un proveedor"
              defaultValue={value("supplierId", defaultSupplierId ?? "")}
              errors={errors.supplierId}
              required
            />
            <FormField name="date" type="date" label="Fecha" defaultValue={value("date", today)} errors={errors.date} required />
            <FormField name="time" type="time" label="Hora (hora de Argentina)" defaultValue={value("time", "09:00")} errors={errors.time} required />
          </>
        )}
        <SelectField name="type" label="Tipo" options={TYPE_OPTIONS} value={type} onChange={(event) => setType(event.target.value)} errors={errors.type} required />
        <FormField name="orderNumber" label="Número de pedido" defaultValue={value("orderNumber", delivery?.orderNumber ?? "")} errors={errors.orderNumber} />
        <SelectField
          name="responsibleUserId"
          label="Responsable"
          options={users}
          placeholder="Sin responsable"
          defaultValue={value("responsibleUserId", delivery?.responsibleUserId ?? defaultResponsibleId ?? "")}
          errors={errors.responsibleUserId}
        />
      </fieldset>
      {!isGoodsDelivery(type as DeliveryType) ? (
        <p role="note" className="text-muted-foreground text-sm">
          Es una visita: no trae mercadería, así que se marca como &quot;realizada&quot; y no se recibe.
        </p>
      ) : null}

      <fieldset className="grid gap-4">
        <legend className="mb-2 text-lg font-medium">Productos esperados (opcional)</legend>
        <div className="max-w-xl">
          <ProductPicker label="Agregar producto" onSelect={addItem} hint="Buscá por nombre o escaneá el código de barras." inputId="delivery-item-search" />
        </div>
        {errors.items ? (
          <p role="alert" className="text-destructive text-sm">
            {errors.items.join(" ")}
          </p>
        ) : null}
        {items.length === 0 ? (
          <p className="text-muted-foreground text-sm">Sin productos esperados: la recepción se registrará sin comparar contra un pedido.</p>
        ) : (
          <ul className="grid gap-2" aria-label="Productos esperados">
            {items.map((row, index) => (
              <li key={row.productId} className="flex flex-wrap items-end justify-between gap-3 rounded-md border px-3 py-2">
                <div>
                  <p className="font-medium">{row.name}</p>
                  <p className="text-muted-foreground text-xs">{row.code}</p>
                </div>
                <div className="flex items-end gap-2">
                  <div className="grid gap-1">
                    <Label htmlFor={`item-qty-${index}`}>Cantidad</Label>
                    <input
                      id={`item-qty-${index}`}
                      value={row.quantity}
                      onChange={(event) =>
                        setItems((current) => current.map((item) => (item.productId === row.productId ? { ...item, quantity: event.target.value } : item)))
                      }
                      inputMode="numeric"
                      autoComplete="off"
                      aria-label={`Cantidad esperada de ${row.name}`}
                      className="border-input h-9 w-24 rounded-md border bg-transparent px-3 text-sm tabular-nums"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setItems((current) => current.filter((item) => item.productId !== row.productId))}
                    aria-label={`Quitar ${row.name}`}
                  >
                    Quitar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <div className="grid gap-2">
        <Label htmlFor="notes">Notas</Label>
        <Textarea id="notes" name="notes" defaultValue={value("notes", delivery?.notes ?? "")} aria-invalid={errors.notes ? true : undefined} />
        {errors.notes ? (
          <p role="alert" className="text-destructive text-sm">
            {errors.notes.join(" ")}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando..." : isEdit ? "Guardar cambios" : "Programar"}
        </Button>
        <Button asChild variant="outline">
          <Link href={isEdit ? `/entregas/${delivery.id}` : "/entregas"}>Cancelar</Link>
        </Button>
      </div>
    </form>
  );
}
