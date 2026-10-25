import Link from "next/link";
import { SortableHead } from "@/components/sortable-head";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { SortDirection } from "@/shared/application/list-query";
import { formatDateTime } from "@/shared/domain/dates";
import type { DeliverySummary } from "../application/ports";
import { deliveryAlertState } from "../domain/delivery-schedule";
import { DeliveryAlertBadge, DeliveryStatusBadge, DeliveryTypeBadge } from "./delivery-badges";

interface DeliveriesTableProps {
  deliveries: DeliverySummary[];
  sort: string;
  dir: SortDirection;
  /** Current filter params (without sort/dir/page), preserved by the sort links. */
  params: Record<string, string | undefined>;
  now: Date;
  /** Show the supplier column (hidden on a supplier's own page). */
  showSupplier?: boolean;
}

/** Presentational: renders one page of deliveries ordered by the URL's sort. */
export function DeliveriesTable({ deliveries, sort, dir, params, now, showSupplier = true }: DeliveriesTableProps) {
  const head = { sort, dir, basePath: "/entregas", params: { view: "list", ...params } };
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <SortableHead {...head} label="Fecha y hora" field="scheduledAt" />
          {showSupplier ? <SortableHead {...head} label="Proveedor" field="supplier" /> : null}
          <SortableHead {...head} label="Tipo" field="type" />
          <SortableHead {...head} label="Estado" field="status" />
          <TableHead>Pedido</TableHead>
          <TableHead>Responsable</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {deliveries.length === 0 ? (
          <TableRow>
            <TableCell colSpan={showSupplier ? 6 : 5} className="text-muted-foreground text-center">
              No hay entregas que coincidan con los filtros.
            </TableCell>
          </TableRow>
        ) : (
          deliveries.map((delivery) => (
            <TableRow key={delivery.id}>
              <TableCell className="font-medium">
                <Link href={`/entregas/${delivery.id}`} className="underline-offset-4 hover:underline">
                  {formatDateTime(delivery.scheduledAt)}
                </Link>
              </TableCell>
              {showSupplier ? <TableCell>{delivery.supplierName}</TableCell> : null}
              <TableCell>
                <DeliveryTypeBadge type={delivery.type} />
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  <DeliveryStatusBadge status={delivery.status} />
                  <DeliveryAlertBadge alert={deliveryAlertState(delivery, now)} />
                </div>
              </TableCell>
              <TableCell>{delivery.orderNumber ?? "-"}</TableCell>
              <TableCell>{delivery.responsibleUserName ?? "-"}</TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
