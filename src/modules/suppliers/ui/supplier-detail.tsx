import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/shared/domain/dates";
import type { SupplierRecord } from "../application/ports";
import { formatCuit } from "../domain/cuit";
import { formatVisitDays } from "../domain/supplier";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd>{children || "-"}</dd>
    </div>
  );
}

/** Presentational: read-only supplier data grouped like the form. */
export function SupplierDetail({ supplier }: { supplier: SupplierRecord }) {
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Datos generales</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Row label="CUIT">{supplier.cuit ? formatCuit(supplier.cuit) : null}</Row>
            <Row label="Contacto">{supplier.contactName}</Row>
            <Row label="Teléfono">{supplier.phone}</Row>
            <Row label="Email">{supplier.email ? <a href={`mailto:${supplier.email}`} className="underline underline-offset-4">{supplier.email}</a> : null}</Row>
            <Row label="Dirección">{supplier.address}</Row>
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Entregas</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Row label="Días de visita">{formatVisitDays(supplier.visitDays)}</Row>
            <Row label="Horario de entrega">{supplier.deliveryHours}</Row>
            <Row label="Plazo de entrega">{supplier.leadTimeDays === null ? null : `${supplier.leadTimeDays} ${supplier.leadTimeDays === 1 ? "día" : "días"}`}</Row>
          </dl>
        </CardContent>
      </Card>
      {supplier.notes ? (
        <Card>
          <CardHeader>
            <CardTitle>Notas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-line">{supplier.notes}</p>
          </CardContent>
        </Card>
      ) : null}
      <p className="text-muted-foreground text-sm">
        Creado el {formatDateTime(supplier.createdAt)} · Última modificación {formatDateTime(supplier.updatedAt)}
      </p>
    </div>
  );
}
