import Link from "next/link";
import { BarcodeInput } from "@/components/barcode-input";
import { FormField } from "@/components/form-field";
import { SelectField, type SelectOption } from "@/components/select-field";
import { Button } from "@/components/ui/button";

interface LotFiltersProps {
  values: {
    search?: string;
    productId?: string;
    categoryId?: string;
    supplierId?: string;
    status?: string;
    expiryFrom?: string;
    expiryTo?: string;
    sort: string;
    dir: string;
  };
  /** Name of the product when filtering by `productId` (shown as a removable chip). */
  productName?: string;
  categories: SelectOption[];
  suppliers: SelectOption[];
}

const STATUS_OPTIONS: SelectOption[] = [
  { value: "AVAILABLE", label: "Disponible" },
  { value: "QUARANTINE", label: "Cuarentena" },
  { value: "BLOCKED", label: "Bloqueado" },
  { value: "EXPIRED", label: "Vencido" },
  { value: "DEPLETED", label: "Agotado" },
  { value: "ALL", label: "Todos (incluye agotados)" },
];

/** GET form: every filter lives in the URL. */
export function LotFilters({ values, productName, categories, suppliers }: LotFiltersProps) {
  return (
    <form method="get" action="/lotes" role="search" aria-label="Filtros de lotes" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <input type="hidden" name="sort" value={values.sort} />
      <input type="hidden" name="dir" value={values.dir} />
      {values.productId ? <input type="hidden" name="productId" value={values.productId} /> : null}
      <div className="sm:col-span-2 lg:col-span-4">
        <BarcodeInput
          name="search"
          label="Buscar producto o lote"
          defaultValue={values.search ?? ""}
          placeholder="Nombre, código de barras, SKU o número de lote"
        />
        {values.productId ? (
          <p className="mt-2 text-sm">
            Producto: <strong>{productName ?? "seleccionado"}</strong>{" "}
            <Link href="/lotes" className="underline underline-offset-4">
              Quitar filtro
            </Link>
          </p>
        ) : null}
      </div>
      <SelectField name="categoryId" label="Categoría" options={categories} placeholder="Todas" defaultValue={values.categoryId ?? ""} />
      <SelectField name="supplierId" label="Proveedor" options={suppliers} placeholder="Todos" defaultValue={values.supplierId ?? ""} />
      <SelectField name="status" label="Estado" options={STATUS_OPTIONS} placeholder="Con stock" defaultValue={values.status ?? ""} />
      <div />
      <FormField name="expiryFrom" type="date" label="Vence desde" defaultValue={values.expiryFrom ?? ""} />
      <FormField name="expiryTo" type="date" label="Vence hasta" defaultValue={values.expiryTo ?? ""} />
      <div className="flex items-end gap-2">
        <Button type="submit">Filtrar</Button>
        <Button asChild variant="outline">
          <Link href="/lotes">Limpiar</Link>
        </Button>
      </div>
    </form>
  );
}
