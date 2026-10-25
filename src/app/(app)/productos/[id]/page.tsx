import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/access-denied";
import { Button } from "@/components/ui/button";
import { hasPermission } from "@/modules/auth/domain/permissions";
import { getCurrentUser } from "@/modules/auth/server";
import { getCatalogModule } from "@/modules/catalog/composition";
import { getInventoryModule } from "@/modules/inventory/composition";
import { ProductStockSection } from "@/modules/inventory/ui/product-stock";
import { ArchiveButton } from "@/modules/catalog/ui/archive-button";
import { ProductDetail } from "@/modules/catalog/ui/product-detail";
import { ProductStatusBadge } from "@/modules/catalog/ui/product-status-badge";
import { readGeneralSettings } from "@/modules/settings/infrastructure/read-general-settings";
import { hasErrorCode } from "@/shared/domain/errors";
import { prisma } from "@/shared/infrastructure/db/prisma";
import { isUuid } from "@/shared/domain/ids";

export const metadata: Metadata = { title: "Producto - Farmacia Cabaleiro" };

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user, "products.read")) return <AccessDenied message="No tenés permiso para ver los productos." />;

  const { id } = await params;
  if (!isUuid(id)) notFound();
  const product = await getCatalogModule()
    .catalogService.getProduct(user, id)
    .catch((error) => {
      if (hasErrorCode(error, "NOT_FOUND")) return null;
      throw error;
    });
  if (!product) notFound();

  const archived = product.status === "ARCHIVED";
  const canReadStock = hasPermission(user, "inventory.read");
  const stock = canReadStock ? await getInventoryModule().stockQueries.getProductStock(user, product.id) : null;
  const { expiryThresholds: thresholds, currency } = await readGeneralSettings(prisma);
  const canRegister = hasPermission(user, "inventory.write") && !archived;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{product.commercialName}</h1>
          <ProductStatusBadge status={product.status} />
        </div>
        <div className="flex flex-wrap gap-2">
          {canRegister ? (
            <>
              <Button asChild>
                <Link href={`/movimientos/nuevo?productId=${product.id}`}>Registrar movimiento</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/movimientos/nuevo?productId=${product.id}&type=ENTRY`}>Ingresar lote</Link>
              </Button>
            </>
          ) : null}
          {hasPermission(user, "products.write") && !archived ? (
            <Button asChild variant="outline">
              <Link href={`/productos/${product.id}/editar`}>Editar</Link>
            </Button>
          ) : null}
          {hasPermission(user, "products.archive") ? (
            <ArchiveButton productId={product.id} productName={product.commercialName} archived={archived} />
          ) : null}
        </div>
      </div>
      {stock ? <ProductStockSection stock={stock} productId={product.id} thresholds={thresholds} /> : null}
      <ProductDetail product={product} currency={currency} />
    </div>
  );
}
