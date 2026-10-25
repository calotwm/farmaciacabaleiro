import Link from "next/link";
import { SortableHead } from "@/components/sortable-head";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { SortDirection } from "@/shared/application/list-query";
import type { ProductRecord } from "../application/ports";
import { ProductStatusBadge } from "./product-status-badge";

interface ProductsTableProps {
  products: ProductRecord[];
  sort: string;
  dir: SortDirection;
  /** Current filter params (without sort/dir/page), preserved by the sort links. */
  params: Record<string, string | undefined>;
}

/** Presentational: renders one page of products; sorting goes through the URL. */
export function ProductsTable({ products, sort, dir, params }: ProductsTableProps) {
  const head = { sort, dir, basePath: "/productos", params };
  return (
    <Table framed>
      <TableHeader>
        <TableRow>
          <SortableHead {...head} label="Nombre" field="name" />
          <SortableHead {...head} label="Código" field="code" />
          <TableHead>Código de barras</TableHead>
          <SortableHead {...head} label="Categoría" field="category" />
          <TableHead>Proveedor habitual</TableHead>
          <SortableHead {...head} label="Stock mínimo" field="minStock" />
          <TableHead>Estado</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {products.length === 0 ? (
          <TableRow>
            <TableCell colSpan={7} className="text-muted-foreground text-center">
              No hay productos que coincidan con la búsqueda.
            </TableCell>
          </TableRow>
        ) : (
          products.map((product) => (
            <TableRow key={product.id}>
              <TableCell className="font-medium">
                <Link href={`/productos/${product.id}`} className="underline-offset-4 hover:underline">
                  {product.commercialName}
                </Link>
                {product.activeIngredient ? <p className="text-muted-foreground text-xs">{product.activeIngredient}</p> : null}
              </TableCell>
              <TableCell>{product.code}</TableCell>
              <TableCell>{product.barcode ?? "-"}</TableCell>
              <TableCell>{product.categoryName}</TableCell>
              <TableCell>{product.usualSupplierName ?? "-"}</TableCell>
              <TableCell>{product.minStock}</TableCell>
              <TableCell>
                <ProductStatusBadge status={product.status} />
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
