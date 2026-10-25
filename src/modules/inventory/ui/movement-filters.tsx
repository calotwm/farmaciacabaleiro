import Link from "next/link";
import { BarcodeInput } from "@/components/barcode-input";
import { FormField } from "@/components/form-field";
import { SelectField, type SelectOption } from "@/components/select-field";
import { Button } from "@/components/ui/button";
import { HISTORY_MOVEMENT_TYPES, MOVEMENT_TYPE_LABELS } from "../domain/movement-type";

interface MovementFiltersProps {
  values: { search?: string; type?: string; productId?: string; lotId?: string; userId?: string; from?: string; to?: string };
  users: SelectOption[];
  productName?: string;
  lotNumber?: string;
}

const TYPE_OPTIONS: SelectOption[] = HISTORY_MOVEMENT_TYPES.filter((type) => type !== "COUNT_CORRECTION").map((type) => ({
  value: type,
  label: MOVEMENT_TYPE_LABELS[type],
}));

/** GET form: every filter lives in the URL. */
export function MovementFilters({ values, users, productName, lotNumber }: MovementFiltersProps) {
  return (
    <form method="get" action="/movimientos" role="search" aria-label="Filtros de movimientos" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {values.productId ? <input type="hidden" name="productId" value={values.productId} /> : null}
      {values.lotId ? <input type="hidden" name="lotId" value={values.lotId} /> : null}
      <div className="sm:col-span-2 lg:col-span-4">
        <BarcodeInput
          name="search"
          label="Buscar producto o lote"
          defaultValue={values.search ?? ""}
          placeholder="Nombre, código de barras, SKU o número de lote"
        />
        {values.productId || values.lotId ? (
          <p className="mt-2 text-sm">
            {values.productId ? (
              <>
                Producto: <strong>{productName ?? "seleccionado"}</strong>{" "}
              </>
            ) : null}
            {values.lotId ? (
              <>
                Lote: <strong>{lotNumber ?? "seleccionado"}</strong>{" "}
              </>
            ) : null}
            <Link href="/movimientos" className="underline underline-offset-4">
              Quitar filtros
            </Link>
          </p>
        ) : null}
      </div>
      <SelectField name="type" label="Tipo" options={TYPE_OPTIONS} placeholder="Todos" defaultValue={values.type ?? ""} />
      <SelectField name="userId" label="Usuario" options={users} placeholder="Todos" defaultValue={values.userId ?? ""} />
      <FormField name="from" type="date" label="Desde" defaultValue={values.from ?? ""} />
      <FormField name="to" type="date" label="Hasta" defaultValue={values.to ?? ""} />
      <div className="flex items-end gap-2">
        <Button type="submit">Filtrar</Button>
        <Button asChild variant="outline">
          <Link href="/movimientos">Limpiar</Link>
        </Button>
      </div>
    </form>
  );
}
