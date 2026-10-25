import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/shared/domain/dates";
import type { ReceiptSummary } from "../application/ports";
import { ReceiptIssuesBadge, ReceiptStatusBadge } from "./receipt-badges";

/** Presentational: one page of receipts (newest first; drafts on top). */
export function ReceiptsTable({ receipts, showSupplier = true }: { receipts: ReceiptSummary[]; showSupplier?: boolean }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Fecha</TableHead>
          {showSupplier ? <TableHead>Proveedor</TableHead> : null}
          <TableHead>Comprobante</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead className="text-right">Renglones</TableHead>
          <TableHead>Entrega</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {receipts.length === 0 ? (
          <TableRow>
            <TableCell colSpan={showSupplier ? 6 : 5} className="text-muted-foreground text-center">
              No hay recepciones que coincidan con los filtros.
            </TableCell>
          </TableRow>
        ) : (
          receipts.map((receipt) => (
            <TableRow key={receipt.id}>
              <TableCell className="font-medium">
                <Link href={`/recepciones/${receipt.id}`} className="underline-offset-4 hover:underline">
                  {formatDateTime(receipt.confirmedAt ?? receipt.createdAt)}
                </Link>
              </TableCell>
              {showSupplier ? <TableCell>{receipt.supplierName}</TableCell> : null}
              <TableCell>{receipt.invoiceNumber ?? "-"}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  <ReceiptStatusBadge status={receipt.status} isPartial={receipt.isPartial} />
                  <ReceiptIssuesBadge count={receipt.issueCount} />
                </div>
              </TableCell>
              <TableCell className="text-right tabular-nums">{receipt.lineCount}</TableCell>
              <TableCell>
                {receipt.deliveryId ? (
                  <Link href={`/entregas/${receipt.deliveryId}`} className="underline underline-offset-4">
                    Ver entrega
                  </Link>
                ) : (
                  "Sin programar"
                )}
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
