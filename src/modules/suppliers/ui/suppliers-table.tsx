import Link from "next/link";
import { SortableHead } from "@/components/sortable-head";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { SortDirection } from "@/shared/application/list-query";
import type { SupplierRecord } from "../application/ports";
import { formatCuit } from "../domain/cuit";
import { formatVisitDays } from "../domain/supplier";
import { SupplierStatusBadge } from "./supplier-status-badge";

interface SuppliersTableProps {
  suppliers: SupplierRecord[];
  sort: string;
  dir: SortDirection;
  /** Current filter params (without sort/dir/page), preserved by the sort links. */
  params: Record<string, string | undefined>;
}

/** Presentational: renders one page of suppliers; sorting goes through the URL. */
export function SuppliersTable({ suppliers, sort, dir, params }: SuppliersTableProps) {
  const head = { sort, dir, basePath: "/proveedores", params };
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <SortableHead {...head} label="Nombre" field="name" />
          <SortableHead {...head} label="CUIT" field="cuit" />
          <TableHead>Contacto</TableHead>
          <TableHead>Días de visita</TableHead>
          <SortableHead {...head} label="Plazo (días)" field="leadTime" />
          <SortableHead {...head} label="Estado" field="status" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {suppliers.length === 0 ? (
          <TableRow>
            <TableCell colSpan={6} className="text-muted-foreground text-center">
              No hay proveedores que coincidan con la búsqueda.
            </TableCell>
          </TableRow>
        ) : (
          suppliers.map((supplier) => (
            <TableRow key={supplier.id}>
              <TableCell className="font-medium">
                <Link href={`/proveedores/${supplier.id}`} className="underline-offset-4 hover:underline">
                  {supplier.name}
                </Link>
              </TableCell>
              <TableCell>{supplier.cuit ? formatCuit(supplier.cuit) : "-"}</TableCell>
              <TableCell>
                {supplier.contactName ?? "-"}
                {supplier.phone ? <p className="text-muted-foreground text-xs">{supplier.phone}</p> : null}
              </TableCell>
              <TableCell>{formatVisitDays(supplier.visitDays) || "-"}</TableCell>
              <TableCell>{supplier.leadTimeDays ?? "-"}</TableCell>
              <TableCell>
                <SupplierStatusBadge status={supplier.status} />
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
