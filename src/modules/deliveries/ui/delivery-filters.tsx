import Link from "next/link";
import { FormField } from "@/components/form-field";
import { SelectField, type SelectOption } from "@/components/select-field";
import { Button } from "@/components/ui/button";
import { DELIVERY_STATUSES, DELIVERY_TYPES, DELIVERY_TYPE_LABELS, deliveryStatusLabel } from "../domain/delivery-status";

export type DeliveryView = "list" | "calendar";

interface DeliveryFiltersProps {
  view: DeliveryView;
  values: { supplierId?: string; type?: string; status?: string; from?: string; to?: string; late?: boolean; month?: string; sort: string; dir: string };
  suppliers: SelectOption[];
}

const TYPE_OPTIONS: SelectOption[] = DELIVERY_TYPES.map((type) => ({ value: type, label: DELIVERY_TYPE_LABELS[type] }));
const STATUS_OPTIONS: SelectOption[] = DELIVERY_STATUSES.map((status) => ({ value: status, label: deliveryStatusLabel(status) }));

/** GET form: every filter lives in the URL. The date range and "late only" apply to the list view. */
export function DeliveryFilters({ view, values, suppliers }: DeliveryFiltersProps) {
  return (
    <form method="get" action="/entregas" role="search" aria-label="Filtros de entregas" className="bg-card grid gap-3 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-4">
      <input type="hidden" name="view" value={view} />
      {view === "list" ? (
        <>
          <input type="hidden" name="sort" value={values.sort} />
          <input type="hidden" name="dir" value={values.dir} />
        </>
      ) : values.month ? (
        <input type="hidden" name="month" value={values.month} />
      ) : null}
      <SelectField name="supplierId" label="Proveedor" options={suppliers} placeholder="Todos" defaultValue={values.supplierId ?? ""} />
      <SelectField name="type" label="Tipo" options={TYPE_OPTIONS} placeholder="Todos" defaultValue={values.type ?? ""} />
      <SelectField name="status" label="Estado" options={STATUS_OPTIONS} placeholder="Todos" defaultValue={values.status ?? ""} />
      {view === "list" ? (
        <>
          <FormField name="from" type="date" label="Desde" defaultValue={values.from ?? ""} />
          <FormField name="to" type="date" label="Hasta" defaultValue={values.to ?? ""} />
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input type="checkbox" name="late" value="1" defaultChecked={values.late} className="size-4" />
            Solo atrasadas
          </label>
        </>
      ) : null}
      <div className="flex items-end gap-2">
        <Button type="submit">Filtrar</Button>
        <Button asChild variant="outline">
          <Link href={view === "calendar" ? "/entregas?view=calendar" : "/entregas"}>Limpiar</Link>
        </Button>
      </div>
    </form>
  );
}
