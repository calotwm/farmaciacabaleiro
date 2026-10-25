import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { daysUntil, formatDate } from "@/shared/domain/dates";
import type { ProductStock } from "../application/stock-queries";
import { LotStatusBadges, daysLeftLabel } from "./lot-status-badges";

const CARDS = [
  { key: "physical", label: "Stock físico", hint: "Todo lo que hay en el depósito" },
  { key: "available", label: "Disponible", hint: "Se puede dispensar" },
  { key: "blocked", label: "Bloqueado", hint: "Cuarentena o unidades retenidas" },
  { key: "expired", label: "Vencido", hint: "Solo se puede dar de baja o devolver" },
] as const;

/** Presentational: the four stock figures derived from the lots, and the lots in FEFO order. */
export function ProductStockSection({ stock, productId }: { stock: ProductStock; productId: string }) {
  return (
    <section className="grid gap-4" aria-labelledby="stock-heading">
      <h2 id="stock-heading" className="text-lg font-medium">
        Stock
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {CARDS.map((card) => (
          <Card key={card.key} data-testid={`stock-${card.key}`}>
            <CardHeader>
              <CardTitle className="text-muted-foreground text-sm font-medium">{card.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold tabular-nums">{stock.breakdown[card.key]}</p>
              <p className="text-muted-foreground text-xs">{card.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Table>
        <caption className="sr-only">Lotes con stock, del que vence primero al que vence último</caption>
        <TableHeader>
          <TableRow>
            <TableHead>Lote</TableHead>
            <TableHead>Vencimiento</TableHead>
            <TableHead>Días restantes</TableHead>
            <TableHead>Cantidad</TableHead>
            <TableHead>Bloqueado</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Orden de uso</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {stock.lots.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-muted-foreground text-center">
                Este producto no tiene lotes con stock.
              </TableCell>
            </TableRow>
          ) : (
            stock.lots.map((lot) => (
              <TableRow key={lot.id}>
                <TableCell className="font-medium">
                  <Link href={`/lotes/${lot.id}`} className="underline-offset-4 hover:underline">
                    {lot.lotNumber}
                  </Link>
                </TableCell>
                <TableCell>{formatDate(lot.expiryDate)}</TableCell>
                <TableCell>{daysLeftLabel(daysUntil(lot.expiryDate, stock.today))}</TableCell>
                <TableCell>{lot.currentQuantity}</TableCell>
                <TableCell>{lot.blockedQuantity}</TableCell>
                <TableCell>
                  <LotStatusBadges lot={lot} today={stock.today} />
                </TableCell>
                <TableCell>{lot.id === stock.firstUsableLotId ? <Badge>Usar primero</Badge> : null}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <p className="text-sm">
        <Link href={`/lotes?productId=${productId}&status=ALL`} className="underline underline-offset-4">
          Ver todos los lotes del producto
        </Link>
        {" · "}
        <Link href={`/movimientos?productId=${productId}`} className="underline underline-offset-4">
          Ver movimientos
        </Link>
      </p>
    </section>
  );
}
