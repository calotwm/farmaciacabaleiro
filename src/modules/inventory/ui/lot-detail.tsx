import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type CalendarDate, daysUntil, formatDate, formatDateTime } from "@/shared/domain/dates";
import { formatMoney } from "@/shared/domain/money";
import type { LotListItem } from "../application/ports";
import { LotStatusBadges, daysLeftLabel } from "./lot-status-badges";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd>{children || "-"}</dd>
    </div>
  );
}

/** Presentational: the facts of one lot. */
export function LotDetail({ lot, today, thresholds }: { lot: LotListItem; today: CalendarDate; thresholds?: readonly number[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Datos del lote</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Row label="Estado">
            <LotStatusBadges lot={lot} today={today} thresholds={thresholds} />
          </Row>
          <Row label="Vencimiento">
            {formatDate(lot.expiryDate)} ({daysLeftLabel(daysUntil(lot.expiryDate, today))})
          </Row>
          <Row label="Cantidad actual">
            {lot.currentQuantity} de {lot.initialQuantity} iniciales
          </Row>
          <Row label="Unidades bloqueadas">{lot.blockedQuantity}</Row>
          <Row label="Recibido">{formatDateTime(lot.receivedAt)}</Row>
          <Row label="Proveedor">{lot.supplierName}</Row>
          <Row label="Factura">{lot.invoiceNumber}</Row>
          <Row label="Costo unitario">{lot.unitCost ? formatMoney(lot.unitCost) : null}</Row>
          <Row label="Ubicación">{lot.location}</Row>
          <Row label="Notas">{lot.notes}</Row>
        </dl>
      </CardContent>
    </Card>
  );
}
