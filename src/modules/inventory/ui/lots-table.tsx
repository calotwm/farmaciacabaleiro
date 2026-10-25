import Link from "next/link";
import { SortableHead } from "@/components/sortable-head";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { SortDirection } from "@/shared/application/list-query";
import { type CalendarDate, daysUntil, formatDate } from "@/shared/domain/dates";
import type { LotListItem } from "../application/ports";
import { LotStatusBadges, daysLeftLabel } from "./lot-status-badges";

interface LotsTableProps {
  lots: LotListItem[];
  today: CalendarDate;
  thresholds?: readonly number[];
  sort: string;
  dir: SortDirection;
  params: Record<string, string | undefined>;
}

/** Presentational: one page of lots; sorting goes through the URL. */
export function LotsTable({ lots, today, thresholds, sort, dir, params }: LotsTableProps) {
  const head = { sort, dir, basePath: "/lotes", params };
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <SortableHead {...head} label="Producto" field="product" />
          <SortableHead {...head} label="Lote" field="lotNumber" />
          <SortableHead {...head} label="Vencimiento" field="expiry" />
          <TableHead>Días restantes</TableHead>
          <SortableHead {...head} label="Cantidad" field="quantity" />
          <TableHead>Bloqueado</TableHead>
          <TableHead>Proveedor</TableHead>
          <TableHead>Estado</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {lots.length === 0 ? (
          <TableRow>
            <TableCell colSpan={8} className="text-muted-foreground text-center">
              No hay lotes que coincidan con los filtros.
            </TableCell>
          </TableRow>
        ) : (
          lots.map((lot) => (
            <TableRow key={lot.id}>
              <TableCell className="font-medium">
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
              <TableCell>{daysLeftLabel(daysUntil(lot.expiryDate, today))}</TableCell>
              <TableCell>
                {lot.currentQuantity} {lot.unitName.toLowerCase()}
              </TableCell>
              <TableCell>{lot.blockedQuantity}</TableCell>
              <TableCell>{lot.supplierName ?? "-"}</TableCell>
              <TableCell>
                <LotStatusBadges lot={lot} today={today} thresholds={thresholds} />
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
