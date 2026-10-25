import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/shared/domain/dates";
import { cn } from "@/shared/lib/utils";
import type { CountLineView } from "../application/ports";
import { effectiveLotStatus } from "../domain/lot";

/** Presentational and read-only: a closed count can no longer be changed. */
export function ClosedCountTable({ lines, today }: { lines: CountLineView[]; today: string }) {
  return (
    <Table>
      <caption className="sr-only">Resultado del conteo cerrado</caption>
      <TableHeader>
        <TableRow>
          <TableHead>Producto</TableHead>
          <TableHead>Lote</TableHead>
          <TableHead>Vencimiento</TableHead>
          <TableHead className="text-right">Esperado</TableHead>
          <TableHead className="text-right">Contado</TableHead>
          <TableHead className="text-right">Diferencia</TableHead>
          <TableHead>Resultado</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {lines.map((line) => {
          const expired = effectiveLotStatus({ expiryDate: line.expiryDate, status: line.lotStatus }, today) === "EXPIRED";
          const difference = line.reconciled ? line.difference : null;
          return (
            <TableRow key={line.id}>
              <TableCell className="font-medium">
                <Link href={`/productos/${line.productId}`} className="underline-offset-4 hover:underline">
                  {line.productName}
                </Link>
              </TableCell>
              <TableCell>
                <Link href={`/lotes/${line.lotId}`} className="underline-offset-4 hover:underline">
                  {line.lotNumber}
                </Link>
              </TableCell>
              <TableCell>
                {formatDate(line.expiryDate)} {expired ? <Badge variant="outline">Vencido</Badge> : null}
              </TableCell>
              <TableCell className="text-right tabular-nums">{line.expectedQuantity}</TableCell>
              <TableCell className="text-right tabular-nums">{line.countedQuantity ?? "-"}</TableCell>
              <TableCell
                className={cn(
                  "text-right tabular-nums",
                  difference !== null && difference < 0 && "text-destructive",
                  difference !== null && difference > 0 && "text-emerald-700 dark:text-emerald-400",
                )}
              >
                {difference === null ? "-" : difference > 0 ? `+${difference}` : difference}
              </TableCell>
              <TableCell>
                {line.countedQuantity === null
                  ? "Sin contar"
                  : difference === 0
                    ? "Sin diferencia"
                    : difference !== null && difference > 0
                      ? "Se sumaron unidades"
                      : "Se restaron unidades"}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
