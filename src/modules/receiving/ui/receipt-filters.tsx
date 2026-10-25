import Link from "next/link";
import { FormField } from "@/components/form-field";
import { SelectField, type SelectOption } from "@/components/select-field";
import { Button } from "@/components/ui/button";

interface ReceiptFiltersProps {
  values: { supplierId?: string; status?: string; from?: string; to?: string; withIssues?: boolean };
  suppliers: SelectOption[];
}

const STATUS_OPTIONS: SelectOption[] = [
  { value: "DRAFT", label: "Borradores" },
  { value: "CONFIRMED", label: "Confirmadas" },
];

/** GET form: every filter lives in the URL. */
export function ReceiptFilters({ values, suppliers }: ReceiptFiltersProps) {
  return (
    <form method="get" action="/recepciones" role="search" aria-label="Filtros de recepciones" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <SelectField name="supplierId" label="Proveedor" options={suppliers} placeholder="Todos" defaultValue={values.supplierId ?? ""} />
      <SelectField name="status" label="Estado" options={STATUS_OPTIONS} placeholder="Todos" defaultValue={values.status ?? ""} />
      <FormField name="from" type="date" label="Desde" defaultValue={values.from ?? ""} />
      <FormField name="to" type="date" label="Hasta" defaultValue={values.to ?? ""} />
      <label className="flex items-end gap-2 pb-2 text-sm">
        <input type="checkbox" name="issues" value="1" defaultChecked={values.withIssues} className="size-4" />
        Solo con problemas
      </label>
      <div className="flex items-end gap-2">
        <Button type="submit">Filtrar</Button>
        <Button asChild variant="outline">
          <Link href="/recepciones">Limpiar</Link>
        </Button>
      </div>
    </form>
  );
}
