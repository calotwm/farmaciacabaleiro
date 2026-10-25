import Link from "next/link";
import { SelectField, type SelectOption } from "@/components/select-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** GET form: text search plus category and supplier; the active bucket travels as a hidden field. */
export function ExpirationFilters({
  bucket,
  values,
  categories,
  suppliers,
}: {
  bucket: string;
  values: { search?: string; categoryId?: string; supplierId?: string };
  categories: SelectOption[];
  suppliers: SelectOption[];
}) {
  return (
    <form
      method="get"
      action="/vencimientos"
      role="search"
      aria-label="Filtros de vencimientos"
      className="bg-card grid gap-3 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_1fr_1fr_auto]"
    >
      <input type="hidden" name="bucket" value={bucket} />
      <div className="grid gap-2">
        <Label htmlFor="search">Buscar</Label>
        <Input id="search" name="search" type="search" defaultValue={values.search ?? ""} placeholder="Producto, principio activo o lote" />
      </div>
      <SelectField name="categoryId" label="Categoría" options={categories} placeholder="Todas" defaultValue={values.categoryId ?? ""} />
      <SelectField name="supplierId" label="Proveedor" options={suppliers} placeholder="Todos" defaultValue={values.supplierId ?? ""} />
      <div className="flex items-end gap-2">
        <Button type="submit">Filtrar</Button>
        <Button asChild variant="outline">
          <Link href={`/vencimientos?bucket=${bucket}`}>Limpiar</Link>
        </Button>
      </div>
    </form>
  );
}
