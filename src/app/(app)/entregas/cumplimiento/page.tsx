import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/access-denied";
import { FormField } from "@/components/form-field";
import { SelectField } from "@/components/select-field";
import { Button } from "@/components/ui/button";
import { hasPermission } from "@/modules/auth/domain/permissions";
import { getCurrentUser } from "@/modules/auth/server";
import { getDeliveriesModule } from "@/modules/deliveries/composition";
import { ComplianceTable } from "@/modules/deliveries/ui/compliance-views";
import { type SearchParams, dateParam, uuidParam } from "@/shared/application/list-query";

export const metadata: Metadata = { title: "Cumplimiento de proveedores - Farmacia Cabaleiro" };

export default async function CompliancePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user, "deliveries.read")) return <AccessDenied message="No tenés permiso para ver las entregas." />;

  const sp = await searchParams;
  const range = { supplierId: uuidParam(sp.supplierId), from: dateParam(sp.from), to: dateParam(sp.to) };
  const { deliveryService } = getDeliveriesModule();
  const [rows, { suppliers }] = await Promise.all([deliveryService.complianceReport(user, range), deliveryService.listOptions(user)]);

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Cumplimiento de proveedores</h1>
        <p className="text-muted-foreground text-sm">
          Solo repartos. &quot;A tiempo&quot; es recibida el día programado o antes (hora de Argentina); los pendientes todavía no vencieron y no entran en el
          porcentaje.
        </p>
      </div>
      <form method="get" action="/entregas/cumplimiento" role="search" aria-label="Filtros de cumplimiento" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SelectField
          name="supplierId"
          label="Proveedor"
          options={suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))}
          placeholder="Todos"
          defaultValue={range.supplierId ?? ""}
        />
        <FormField name="from" type="date" label="Desde" defaultValue={range.from ?? ""} />
        <FormField name="to" type="date" label="Hasta" defaultValue={range.to ?? ""} />
        <div className="flex items-end gap-2">
          <Button type="submit">Filtrar</Button>
          <Button asChild variant="outline">
            <Link href="/entregas/cumplimiento">Limpiar</Link>
          </Button>
        </div>
      </form>
      <ComplianceTable rows={rows} />
    </div>
  );
}
