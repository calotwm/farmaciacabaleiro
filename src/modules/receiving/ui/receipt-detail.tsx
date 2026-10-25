import Link from "next/link";
import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatDateTime } from "@/shared/domain/dates";
import { formatMoney } from "@/shared/domain/money";
import type { ReceiptMovementView, ReceiptRecord } from "../application/ports";
import { ISSUE_TYPE_LABELS, goodQuantity } from "../domain/receipt";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd>{children || "-"}</dd>
    </div>
  );
}

interface ReceiptDetailProps {
  receipt: ReceiptRecord;
  movements: ReceiptMovementView[];
  /** The delivery page needs `deliveries.read`. */
  canLinkDelivery: boolean;
  /** ISO 4217 code from the settings (defaults to ARS). */
  currency?: string;
}

/** Presentational: a receipt with its lines, issues, linked delivery and the stock movements it created. */
export function ReceiptDetail({ receipt, movements, canLinkDelivery, currency }: ReceiptDetailProps) {
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Datos de la recepción</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Row label="Proveedor">
              <Link href={`/proveedores/${receipt.supplierId}`} className="underline underline-offset-4">
                {receipt.supplierName}
              </Link>
            </Row>
            <Row label="Entrega programada">
              {receipt.deliveryId ? (
                canLinkDelivery ? (
                  <Link href={`/entregas/${receipt.deliveryId}`} className="underline underline-offset-4">
                    {receipt.deliveryScheduledAt ? formatDateTime(receipt.deliveryScheduledAt) : "Ver entrega"}
                  </Link>
                ) : (
                  receipt.deliveryScheduledAt && formatDateTime(receipt.deliveryScheduledAt)
                )
              ) : (
                "Recepción sin programar"
              )}
            </Row>
            <Row label="Factura o remito">{receipt.invoiceNumber}</Row>
            <Row label="Confirmada el">{receipt.confirmedAt ? formatDateTime(receipt.confirmedAt) : null}</Row>
            <Row label="Confirmada por">{receipt.confirmedByName}</Row>
            <Row label="Tipo">{receipt.isPartial ? "Parcial: falta recibir el resto de la entrega" : "Completa"}</Row>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Productos recibidos</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead>Lote</TableHead>
                <TableHead>Vencimiento</TableHead>
                <TableHead className="text-right">Recibidas</TableHead>
                <TableHead className="text-right">Dañadas</TableHead>
                <TableHead className="text-right">Ingresadas</TableHead>
                <TableHead className="text-right">Costo unitario</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {receipt.lines.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground text-center">
                    Sin productos cargados.
                  </TableCell>
                </TableRow>
              ) : (
                receipt.lines.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell className="font-medium">
                      <Link href={`/productos/${line.productId}`} className="underline-offset-4 hover:underline">
                        {line.productName}
                      </Link>
                    </TableCell>
                    <TableCell>{line.lotNumber}</TableCell>
                    <TableCell>{formatDate(line.expiryDate)}</TableCell>
                    <TableCell className="text-right tabular-nums">{line.quantity}</TableCell>
                    <TableCell className="text-right tabular-nums">{line.damagedQuantity}</TableCell>
                    <TableCell className="text-right tabular-nums">{goodQuantity(line)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(line.unitCost, { currency })}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Problemas</CardTitle>
        </CardHeader>
        <CardContent>
          {receipt.issues.length === 0 ? (
            <p className="text-muted-foreground text-sm">No se registraron problemas.</p>
          ) : (
            <Table data-testid="receipt-issues">
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead>Descripción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receipt.issues.map((issue) => (
                  <TableRow key={issue.id}>
                    <TableCell className="font-medium">{ISSUE_TYPE_LABELS[issue.type]}</TableCell>
                    <TableCell>{issue.productName ?? "-"}</TableCell>
                    <TableCell className="text-right tabular-nums">{issue.quantity ?? "-"}</TableCell>
                    <TableCell>{issue.description ?? "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {receipt.status === "CONFIRMED" ? (
        <Card>
          <CardHeader>
            <CardTitle>Movimientos de stock creados</CardTitle>
          </CardHeader>
          <CardContent>
            {movements.length === 0 ? (
              <p className="text-muted-foreground text-sm">No ingresó stock (todo lo recibido llegó dañado).</p>
            ) : (
              <Table data-testid="receipt-movements">
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead>Lote</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead className="text-right">Stock del lote</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements.map((movement) => (
                    <TableRow key={movement.id}>
                      <TableCell>{formatDateTime(movement.occurredAt)}</TableCell>
                      <TableCell>{movement.productName}</TableCell>
                      <TableCell>{movement.lotNumber}</TableCell>
                      <TableCell className="text-right tabular-nums">+{movement.quantity}</TableCell>
                      <TableCell className="text-right tabular-nums">{movement.balanceAfter}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : null}

      {receipt.notes ? (
        <Card>
          <CardHeader>
            <CardTitle>Notas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-line">{receipt.notes}</p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
