import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/shared/domain/dates";
import { cn } from "@/shared/lib/utils";
import type { MovementListItem } from "../application/ports";
import { MOVEMENT_TYPE_LABELS, stockDirection } from "../domain/movement-type";

/**
 * Presentational and read-only on purpose: the history is immutable, so there is no edit or
 * delete action anywhere. A mistake is fixed by registering a compensating movement.
 */
export function MovementsTable({ movements }: { movements: MovementListItem[] }) {
  return (
    <Table framed>
      <TableHeader>
        <TableRow>
          <TableHead>Fecha</TableHead>
          <TableHead>Tipo</TableHead>
          <TableHead>Producto</TableHead>
          <TableHead>Lote</TableHead>
          <TableHead className="text-right">Cantidad</TableHead>
          <TableHead className="text-right">Saldo del lote</TableHead>
          <TableHead>Motivo</TableHead>
          <TableHead>Usuario</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {movements.length === 0 ? (
          <TableRow>
            <TableCell colSpan={8} className="text-muted-foreground text-center">
              No hay movimientos que coincidan con los filtros.
            </TableCell>
          </TableRow>
        ) : (
          movements.map((movement) => {
            const direction = stockDirection(movement.type);
            const sign = direction > 0 ? "+" : direction < 0 ? "-" : "";
            return (
              <TableRow key={movement.id}>
                <TableCell className="whitespace-nowrap">{formatDateTime(movement.occurredAt)}</TableCell>
                <TableCell>
                  <Badge variant="outline">{MOVEMENT_TYPE_LABELS[movement.type]}</Badge>
                </TableCell>
                <TableCell>
                  <Link href={`/productos/${movement.productId}`} className="underline-offset-4 hover:underline">
                    {movement.productName}
                  </Link>
                </TableCell>
                <TableCell>
                  <Link href={`/lotes/${movement.lotId}`} className="underline-offset-4 hover:underline">
                    {movement.lotNumber}
                  </Link>
                </TableCell>
                <TableCell className={cn("text-right tabular-nums", direction > 0 && "text-emerald-700 dark:text-emerald-400")}>
                  {sign}
                  {movement.quantity}
                </TableCell>
                <TableCell className="text-right tabular-nums">{movement.balanceAfter}</TableCell>
                <TableCell>{[movement.reasonName, movement.reasonText].filter(Boolean).join(": ") || "-"}</TableCell>
                <TableCell>{movement.userName}</TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
}
