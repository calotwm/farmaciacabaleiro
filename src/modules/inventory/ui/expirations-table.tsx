import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { type CalendarDate, daysUntil, formatDate } from "@/shared/domain/dates";
import { cn } from "@/shared/lib/utils";
import type { LotListItem } from "../application/ports";
import { LotStatusBadges, daysLeftLabel } from "./lot-status-badges";

/** Presentational: one page of lots ordered by expiry, with the days left emphasised when urgent (<= 7 days or expired). */
export function ExpirationsTable({
  lots,
  today,
  thresholds,
  emptyMessage,
}: {
  lots: LotListItem[];
  today: CalendarDate;
  thresholds?: readonly number[];
  emptyMessage: string;
}) {
  return (
    <>
      <Table framed>
        <TableHeader>
          <TableRow>
            <TableHead>Producto</TableHead>
            <TableHead>Lote</TableHead>
            <TableHead>Vence</TableHead>
            <TableHead>Restan</TableHead>
            <TableHead className="text-right">Unidades</TableHead>
            <TableHead className="hidden xl:table-cell">Proveedor</TableHead>
            <TableHead>Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lots.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-muted-foreground py-10 text-center whitespace-normal">
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            lots.map((lot) => {
              const days = daysUntil(lot.expiryDate, today);
              return (
                <TableRow key={lot.id}>
                  <TableCell className="max-w-64 truncate font-medium">
                    <Link href={`/productos/${lot.productId}`} className="underline-offset-4 hover:underline">
                      {lot.productName}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link href={`/lotes/${lot.id}`} className="underline-offset-4 hover:underline">
                      {lot.lotNumber}
                    </Link>
                  </TableCell>
                  <TableCell>{formatDate(lot.expiryDate)}</TableCell>
                  <TableCell className={cn(days <= 7 && "text-danger-soft-foreground font-semibold")}>{daysLeftLabel(days)}</TableCell>
                  <TableCell className="text-right">{lot.currentQuantity.toLocaleString("es-AR")}</TableCell>
                  <TableCell className="text-muted-foreground hidden xl:table-cell">{lot.supplierName ?? "-"}</TableCell>
                  <TableCell>
                    <LotStatusBadges lot={lot} today={today} thresholds={thresholds} />
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </>
  );
}
