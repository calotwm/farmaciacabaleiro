import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { LowStockRow } from "../domain/dashboard-lists";
import { Panel, PanelMessage } from "./panel";

/** Products that cannot be dispensed (nothing available) or are at/below their minimum, scarcest first. */
export function LowStockPanel({ rows, total }: { rows: LowStockRow[]; total: number }) {
  return (
    <Panel id="low-stock" title="Stock bajo y sin stock" count={total} href="/productos?stock=low" hrefLabel="Ver productos">
      {rows.length === 0 ? (
        <PanelMessage tone="ok">Todos los productos están por encima de su mínimo.</PanelMessage>
      ) : (
        <ul className="divide-y">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <span className="grid min-w-0">
                <Link href={`/productos/${row.id}`} className="truncate font-medium underline-offset-4 hover:underline">
                  {row.name}
                </Link>
                <span className="text-muted-foreground text-xs tabular-nums">
                  Disponible {row.available.toLocaleString("es-AR")} · mínimo {row.minStock.toLocaleString("es-AR")}
                </span>
              </span>
              {row.available <= 0 ? <Badge variant="danger">Sin stock</Badge> : <Badge variant="warning">Stock bajo</Badge>}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
