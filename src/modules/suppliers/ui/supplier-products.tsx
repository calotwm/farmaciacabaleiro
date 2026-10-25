"use client";

import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProductPicker } from "@/modules/catalog/ui/product-picker";
import type { ProductHit } from "@/modules/catalog/ui/product-search-actions";
import type { SuppliedProduct } from "../application/ports";
import { addSupplierProductAction, removeSupplierProductAction } from "./supplier-actions";

interface SupplierProductsProps {
  supplierId: string;
  products: SuppliedProduct[];
  /** Adding and removing products is master-data maintenance (`suppliers.write`). */
  canEdit: boolean;
  /** The product pages need `products.read`. */
  canLinkProducts: boolean;
}

/** Products this supplier provides: list, add by search or barcode, remove. */
export function SupplierProducts({ supplierId, products, canEdit, canLinkProducts }: SupplierProductsProps) {
  const [pending, startTransition] = useTransition();

  function report(result: { error?: string; success?: string }) {
    if (result.error) toast.error(result.error);
    else if (result.success) toast.success(result.success);
  }

  function add(product: ProductHit) {
    startTransition(async () => report(await addSupplierProductAction(supplierId, product.id)));
  }

  function remove(product: SuppliedProduct) {
    if (!window.confirm(`¿Quitar "${product.name}" de este proveedor?`)) return;
    startTransition(async () => report(await removeSupplierProductAction(supplierId, product.productId)));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Productos que provee</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {canEdit ? (
          <div className="max-w-xl">
            <ProductPicker
              label="Agregar producto"
              onSelect={add}
              disabled={pending}
              hint="Buscá por nombre o escaneá el código de barras."
              inputId="supplier-product-search"
            />
          </div>
        ) : null}
        {products.length === 0 ? (
          <p className="text-muted-foreground text-sm">Todavía no hay productos asociados a este proveedor.</p>
        ) : (
          <ul className="grid gap-2" aria-label="Productos del proveedor">
            {products.map((product) => (
              <li key={product.productId} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
                <div>
                  {canLinkProducts ? (
                    <Link href={`/productos/${product.productId}`} className="font-medium underline-offset-4 hover:underline">
                      {product.name}
                    </Link>
                  ) : (
                    <span className="font-medium">{product.name}</span>
                  )}
                  <p className="text-muted-foreground text-xs">
                    {product.code}
                    {product.barcode ? ` · ${product.barcode}` : ""}
                    {product.productStatus === "ARCHIVED" ? " · Archivado" : ""}
                  </p>
                </div>
                {canEdit ? (
                  <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => remove(product)} aria-label={`Quitar ${product.name}`}>
                    Quitar
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
