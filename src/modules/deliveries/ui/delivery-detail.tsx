import Link from "next/link";
import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/shared/domain/dates";
import type { DeliveryRecord } from "../application/ports";
import { isGoodsDelivery } from "../domain/delivery-status";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd>{children || "-"}</dd>
    </div>
  );
}

/** Presentational: read-only delivery data, expected products and the reschedule links. */
export function DeliveryDetail({ delivery }: { delivery: DeliveryRecord }) {
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{isGoodsDelivery(delivery.type) ? "Datos de la entrega" : "Datos de la visita"}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Row label="Proveedor">
              <Link href={`/proveedores/${delivery.supplierId}`} className="underline underline-offset-4">
                {delivery.supplierName}
              </Link>
            </Row>
            <Row label="Fecha y hora">{formatDateTime(delivery.scheduledAt)}</Row>
            <Row label="Número de pedido">{delivery.orderNumber}</Row>
            <Row label="Responsable">{delivery.responsibleUserName}</Row>
            {delivery.rescheduledFromId ? (
              <Row label="Reprogramada desde">
                <Link href={`/entregas/${delivery.rescheduledFromId}`} className="underline underline-offset-4">
                  Ver la entrega original
                </Link>
              </Row>
            ) : null}
            {delivery.rescheduledToId ? (
              <Row label="Reprogramada a">
                <Link href={`/entregas/${delivery.rescheduledToId}`} className="underline underline-offset-4">
                  Ver la nueva entrega
                </Link>
              </Row>
            ) : null}
          </dl>
        </CardContent>
      </Card>

      {delivery.expectedItems.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Productos esperados</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead className="text-right">Cantidad esperada</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {delivery.expectedItems.map((item) => (
                  <TableRow key={item.productId}>
                    <TableCell className="font-medium">{item.productName}</TableCell>
                    <TableCell>{item.productCode}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {item.expectedQuantity} {item.unitName.toLowerCase()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {delivery.notes ? (
        <Card>
          <CardHeader>
            <CardTitle>Notas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-line">{delivery.notes}</p>
          </CardContent>
        </Card>
      ) : null}
      <p className="text-muted-foreground text-sm">
        Creada el {formatDateTime(delivery.createdAt)} · Última modificación {formatDateTime(delivery.updatedAt)}
      </p>
    </div>
  );
}
