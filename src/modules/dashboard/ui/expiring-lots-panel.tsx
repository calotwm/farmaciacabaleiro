import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/shared/domain/dates";
import { cn } from "@/shared/lib/utils";
import type { ExpiringLotItem } from "../domain/expiring-lots";
import { Panel, PanelMessage } from "./panel";

function StateBadge({ item }: { item: ExpiringLotItem }) {
  if (item.status === "EXPIRED") return <Badge variant="danger">Vencido</Badge>;
  return item.tone === "danger" ? <Badge variant="danger">Urgente</Badge> : <Badge variant="warning">Por vencer</Badge>;
}

/** Prioritized table of lots that expire soon (soonest first): product, lot, date, days left, units and state. */
export function UpcomingExpirationsPanel({ items, total, horizonDays }: { items: ExpiringLotItem[]; total: number; horizonDays: number }) {
  return (
    <Panel id="upcoming-expirations" title={`Próximos a vencer (${horizonDays} días)`} count={total} href="/vencimientos?bucket=d30" hrefLabel="Ver vencimientos">
      {items.length === 0 ? (
        <PanelMessage tone="ok">No hay lotes con stock que venzan en los próximos {horizonDays} días.</PanelMessage>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead>Lote</TableHead>
                <TableHead>Vence</TableHead>
                <TableHead>Restan</TableHead>
                <TableHead className="text-right">Unidades</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="max-w-56 truncate font-medium">
                    <Link href={`/productos/${item.product.id}`} className="underline-offset-4 hover:underline">
                      {item.product.commercialName}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link href={`/lotes/${item.id}`} className="underline-offset-4 hover:underline">
                      {item.lotNumber}
                    </Link>
                  </TableCell>
                  <TableCell>{formatDate(item.expiryDate)}</TableCell>
                  <TableCell className={cn(item.tone === "danger" && "text-danger-soft-foreground font-semibold")}>
                    {item.headline} {item.caption}
                  </TableCell>
                  <TableCell className="text-right">{item.quantity.toLocaleString("es-AR")}</TableCell>
                  <TableCell>
                    <StateBadge item={item} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {total > items.length ? (
            <p className="text-muted-foreground border-t px-4 py-2 text-xs">
              Mostrando {items.length} de {total} lotes.
            </p>
          ) : null}
        </>
      )}
    </Panel>
  );
}

/** Expired lots that still hold stock: a compact list, kept apart from the ones still sellable. */
export function ExpiredLotsPanel({ items, total }: { items: ExpiringLotItem[]; total: number }) {
  return (
    <Panel id="expired-lots" title="Vencidos con stock" count={total} href="/vencimientos?bucket=expired">
      {items.length === 0 ? (
        <PanelMessage tone="ok">No hay lotes vencidos con stock.</PanelMessage>
      ) : (
        <ul className="divide-y">
          {items.map((item) => (
            <li key={item.id} className="flex items-baseline justify-between gap-3 px-4 py-2.5 text-sm">
              <span className="grid min-w-0">
                <Link href={`/lotes/${item.id}`} className="truncate font-medium underline-offset-4 hover:underline">
                  {item.product.commercialName}
                </Link>
                <span className="text-muted-foreground text-xs tabular-nums">
                  Lote {item.lotNumber} · venció el {formatDate(item.expiryDate)}
                </span>
              </span>
              <span className="text-danger-soft-foreground shrink-0 font-semibold tabular-nums">{item.quantity.toLocaleString("es-AR")} u.</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
