import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ComplianceSummary } from "../domain/compliance";

export function formatPercentage(value: number | null): string {
  return value === null ? "-" : `${value}%`;
}

/** Per-supplier compliance table (the `/entregas/cumplimiento` report). */
export function ComplianceTable({ rows }: { rows: Array<{ supplierId: string; supplierName: string; summary: ComplianceSummary }> }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Proveedor</TableHead>
          <TableHead className="text-right">Programadas</TableHead>
          <TableHead className="text-right">A tiempo</TableHead>
          <TableHead className="text-right">Tarde</TableHead>
          <TableHead className="text-right">Reprogramadas</TableHead>
          <TableHead className="text-right">Canceladas</TableHead>
          <TableHead className="text-right">Atrasadas</TableHead>
          <TableHead className="text-right">Pendientes</TableHead>
          <TableHead className="text-right">Cumplimiento</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={9} className="text-muted-foreground text-center">
              No hay repartos programados en el período.
            </TableCell>
          </TableRow>
        ) : (
          rows.map(({ supplierId, supplierName, summary }) => (
            <TableRow key={supplierId}>
              <TableCell className="font-medium">
                <Link href={`/proveedores/${supplierId}`} className="underline-offset-4 hover:underline">
                  {supplierName}
                </Link>
              </TableCell>
              <TableCell className="text-right tabular-nums">{summary.scheduled}</TableCell>
              <TableCell className="text-right tabular-nums">{summary.onTime}</TableCell>
              <TableCell className="text-right tabular-nums">{summary.receivedLate}</TableCell>
              <TableCell className="text-right tabular-nums">{summary.rescheduled}</TableCell>
              <TableCell className="text-right tabular-nums">{summary.cancelled}</TableCell>
              <TableCell className="text-right tabular-nums">{summary.overdue}</TableCell>
              <TableCell className="text-right tabular-nums">{summary.pending}</TableCell>
              <TableCell className="text-right font-medium tabular-nums">{formatPercentage(summary.onTimePercentage)}</TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

const LEGEND = "A tiempo: recibida el día programado o antes (hora de Argentina). Los pendientes todavía no vencieron y no entran en el porcentaje.";

/** Compliance card of one supplier (supplier detail page). */
export function ComplianceCard({ summary, supplierId }: { summary: ComplianceSummary; supplierId: string }) {
  const figures: Array<[string, number]> = [
    ["Programadas", summary.scheduled],
    ["A tiempo", summary.onTime],
    ["Tarde", summary.receivedLate],
    ["Reprogramadas", summary.rescheduled],
    ["Canceladas", summary.cancelled],
    ["Atrasadas", summary.overdue],
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cumplimiento</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {summary.scheduled === 0 ? (
          <p className="text-muted-foreground text-sm">Todavía no hay repartos programados con este proveedor.</p>
        ) : (
          <>
            <p className="text-3xl font-semibold" aria-label={`Cumplimiento ${formatPercentage(summary.onTimePercentage)}`}>
              {formatPercentage(summary.onTimePercentage)}
            </p>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {figures.map(([label, count]) => (
                <div key={label} className="grid gap-0.5">
                  <dt className="text-muted-foreground text-sm">{label}</dt>
                  <dd className="tabular-nums">{count}</dd>
                </div>
              ))}
            </dl>
            <p className="text-muted-foreground text-xs">{LEGEND}</p>
            <Link href={`/entregas/cumplimiento?supplierId=${supplierId}`} className="w-fit text-sm underline underline-offset-4">
              Ver el informe de cumplimiento
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}
