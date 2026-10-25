import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/shared/domain/dates";
import type { CountListItem } from "../application/ports";

/** Presentational: the list of physical counts, newest first. */
export function CountsTable({ counts }: { counts: CountListItem[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Abierto</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>Alcance y notas</TableHead>
          <TableHead>Responsable</TableHead>
          <TableHead className="text-right">Contados</TableHead>
          <TableHead>Cerrado</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {counts.length === 0 ? (
          <TableRow>
            <TableCell colSpan={6} className="text-muted-foreground text-center">
              Todavía no se hizo ningún conteo.
            </TableCell>
          </TableRow>
        ) : (
          counts.map((count) => (
            <TableRow key={count.id}>
              <TableCell>
                <Link href={`/conteos/${count.id}`} className="underline-offset-4 hover:underline">
                  {formatDateTime(count.createdAt)}
                </Link>
              </TableCell>
              <TableCell>
                <Badge variant={count.status === "OPEN" ? "default" : "secondary"}>{count.status === "OPEN" ? "Abierto" : "Cerrado"}</Badge>
              </TableCell>
              <TableCell>{count.notes ?? "Todos los lotes"}</TableCell>
              <TableCell>{count.createdByName}</TableCell>
              <TableCell className="text-right tabular-nums">
                {count.countedLines} / {count.totalLines}
              </TableCell>
              <TableCell>{count.closedAt ? formatDateTime(count.closedAt) : "-"}</TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
