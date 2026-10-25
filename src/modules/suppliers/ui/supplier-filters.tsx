import Link from "next/link";
import { FormField } from "@/components/form-field";
import { SelectField, type SelectOption } from "@/components/select-field";
import { Button } from "@/components/ui/button";
import { SUPPLIER_STATUS_LABELS } from "../domain/supplier";

interface SupplierFiltersProps {
  values: { q?: string; status?: string; sort: string; dir: string };
}

const STATUS_OPTIONS: SelectOption[] = [
  { value: "ACTIVE", label: `${SUPPLIER_STATUS_LABELS.ACTIVE}s` },
  { value: "INACTIVE", label: `${SUPPLIER_STATUS_LABELS.INACTIVE}s` },
];

/** GET form: filters live in the URL, so results are shareable and need no JavaScript. */
export function SupplierFilters({ values }: SupplierFiltersProps) {
  return (
    <form method="get" action="/proveedores" role="search" aria-label="Filtros de proveedores" className="bg-card grid gap-3 rounded-xl border p-4 sm:grid-cols-3">
      <input type="hidden" name="sort" value={values.sort} />
      <input type="hidden" name="dir" value={values.dir} />
      <div className="sm:col-span-2">
        <FormField name="q" label="Buscar" defaultValue={values.q ?? ""} placeholder="Nombre, CUIT o contacto" autoComplete="off" />
      </div>
      <SelectField name="status" label="Estado" options={STATUS_OPTIONS} placeholder="Todos" defaultValue={values.status ?? ""} />
      <div className="flex items-end gap-2">
        <Button type="submit">Buscar</Button>
        <Button asChild variant="outline">
          <Link href="/proveedores">Limpiar</Link>
        </Button>
      </div>
    </form>
  );
}
