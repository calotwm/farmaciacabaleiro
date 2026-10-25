import Link from "next/link";
import { BarcodeInput } from "@/components/barcode-input";
import { SelectField, type SelectOption } from "@/components/select-field";
import { Button } from "@/components/ui/button";

interface ProductFiltersProps {
  values: { q?: string; categoryId?: string; supplierId?: string; status?: string; sort: string; dir: string };
  categories: SelectOption[];
  suppliers: SelectOption[];
}

const STATUS_OPTIONS: SelectOption[] = [
  { value: "ACTIVE", label: "Activos" },
  { value: "INACTIVE", label: "Inactivos" },
  { value: "ARCHIVED", label: "Archivados" },
  { value: "ALL", label: "Todos (incluye archivados)" },
];

/** GET form: filters live in the URL, so results are shareable and need no JavaScript. */
export function ProductFilters({ values, categories, suppliers }: ProductFiltersProps) {
  return (
    <form method="get" action="/productos" role="search" aria-label="Filtros de productos" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <input type="hidden" name="sort" value={values.sort} />
      <input type="hidden" name="dir" value={values.dir} />
      <div className="sm:col-span-2 lg:col-span-4">
        <BarcodeInput
          name="q"
          label="Buscar"
          defaultValue={values.q ?? ""}
          placeholder="Nombre, principio activo, marca, código de barras o SKU"
          hint="Escaneá un código de barras y presioná Enter para ir directo al producto."
          autoFocus
        />
      </div>
      <SelectField name="categoryId" label="Categoría" options={categories} placeholder="Todas" defaultValue={values.categoryId ?? ""} />
      <SelectField name="supplierId" label="Proveedor habitual" options={suppliers} placeholder="Todos" defaultValue={values.supplierId ?? ""} />
      <SelectField name="status" label="Estado" options={STATUS_OPTIONS} placeholder="Activos e inactivos" defaultValue={values.status ?? ""} />
      <div className="flex items-end gap-2">
        <Button type="submit">Buscar</Button>
        <Button asChild variant="outline">
          <Link href="/productos">Limpiar</Link>
        </Button>
      </div>
    </form>
  );
}
