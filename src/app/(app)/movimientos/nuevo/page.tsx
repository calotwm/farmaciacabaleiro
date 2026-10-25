import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AccessDenied } from "@/components/access-denied";
import { BarcodeInput } from "@/components/barcode-input";
import { Button } from "@/components/ui/button";
import { hasPermission } from "@/modules/auth/domain/permissions";
import { getCurrentUser } from "@/modules/auth/server";
import { getCatalogModule } from "@/modules/catalog/composition";
import { getInventoryModule } from "@/modules/inventory/composition";
import { MOVEMENT_TYPES, type ReasonKind, type RegistrableMovementType } from "@/modules/inventory/domain/movement-type";
import { MovementForm } from "@/modules/inventory/ui/movement-form";
import { firstParam, type SearchParams, uuidParam } from "@/shared/application/list-query";
import { normalizeBarcode } from "@/shared/domain/barcode";
import { hasErrorCode } from "@/shared/domain/errors";

export const metadata: Metadata = { title: "Nuevo movimiento - Farmacia Cabaleiro" };

const WRITE_OFF_TYPES: readonly RegistrableMovementType[] = ["RETURN", "WRITE_OFF"];
const RECEIVING_TYPES: readonly RegistrableMovementType[] = ["ENTRY", "ADJUSTMENT_IN"];

export default async function NewMovementPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await getCurrentUser();
  const canWrite = !!user && hasPermission(user, "inventory.write");
  const canWriteOff = !!user && hasPermission(user, "inventory.writeoff");
  if (!user || (!canWrite && !canWriteOff) || !hasPermission(user, "inventory.read") || !hasPermission(user, "products.read")) {
    return <AccessDenied message="No tenés permiso para registrar movimientos." />;
  }

  const sp = await searchParams;
  const typeParam = firstParam(sp.type);
  const initialType = (MOVEMENT_TYPES as readonly string[]).includes(typeParam ?? "") ? (typeParam as RegistrableMovementType) : "EXIT";
  const productId = uuidParam(sp.productId);
  const { catalogService } = getCatalogModule();

  // Step 1: scan or search the product.
  if (!productId) {
    const query = firstParam(sp.q);
    const hit = query ? await catalogService.findByBarcode(user, normalizeBarcode(query)) : null;
    if (hit) redirect(`/movimientos/nuevo?productId=${hit.id}${typeParam ? `&type=${initialType}` : ""}`);
    const results = query
      ? (await catalogService.listProducts(user, { search: query, status: "", sort: "name", dir: "asc", page: 1, pageSize: 10 })).items
      : [];

    return (
      <div className="grid max-w-3xl gap-4">
        <h1 className="text-2xl font-semibold">Nuevo movimiento</h1>
        <form method="get" action="/movimientos/nuevo" role="search" aria-label="Selección de producto" className="grid gap-3">
          {typeParam ? <input type="hidden" name="type" value={initialType} /> : null}
          <BarcodeInput
            name="q"
            label="Producto"
            defaultValue={query ?? ""}
            placeholder="Escaneá el código de barras o buscá por nombre"
            hint="Con el lector, el Enter te lleva directo al producto."
            autoFocus
          />
          <Button type="submit" className="w-fit">
            Buscar
          </Button>
        </form>
        {query ? (
          results.length === 0 ? (
            <p role="status" className="text-muted-foreground">
              No se encontraron productos para &quot;{query}&quot;.
            </p>
          ) : (
            <ul className="grid gap-2" aria-label="Resultados">
              {results.map((product) => (
                <li key={product.id}>
                  <Link
                    href={`/movimientos/nuevo?productId=${product.id}${typeParam ? `&type=${initialType}` : ""}`}
                    className="hover:bg-accent block rounded-md border p-3"
                  >
                    <span className="font-medium">{product.commercialName}</span>
                    <span className="text-muted-foreground block text-sm">
                      {[product.activeIngredient, product.barcode, product.code].filter(Boolean).join(" · ")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </div>
    );
  }

  // Step 2: the movement itself.
  const { stockQueries } = getInventoryModule();
  const product = await catalogService.getProduct(user, productId).catch((error) => {
    if (hasErrorCode(error, "NOT_FOUND")) return null;
    throw error;
  });
  if (!product) notFound();

  const [stock, allReasons, suppliers] = await Promise.all([
    stockQueries.getProductStock(user, product.id),
    stockQueries.listReasons(user),
    stockQueries.listSupplierOptions(user),
  ]);
  const reasons: Record<ReasonKind, Array<{ id: string; name: string }>> = { ADJUSTMENT: [], WRITE_OFF: [], RETURN: [] };
  for (const reason of allReasons) reasons[reason.kind].push({ id: reason.id, name: reason.name });

  const archived = product.status === "ARCHIVED";
  const allowedTypes = MOVEMENT_TYPES.filter((type) => {
    if (WRITE_OFF_TYPES.includes(type)) return canWriteOff;
    if (archived && RECEIVING_TYPES.includes(type)) return false;
    return canWrite;
  });
  const startType = allowedTypes.includes(initialType) ? initialType : (allowedTypes[0] ?? "EXIT");

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Nuevo movimiento</h1>
        <p>
          <Link href={`/productos/${product.id}`} className="font-medium underline underline-offset-4">
            {product.commercialName}
          </Link>{" "}
          <span className="text-muted-foreground">
            · Disponible: {stock.breakdown.available} · Físico: {stock.breakdown.physical} ·{" "}
            <Link href="/movimientos/nuevo" className="underline underline-offset-4">
              Cambiar producto
            </Link>
          </span>
        </p>
        {archived ? <p className="text-muted-foreground text-sm">El producto está archivado: no se le puede ingresar stock.</p> : null}
      </div>
      <MovementForm
        key={`${product.id}-${startType}`}
        product={{ id: product.id, name: product.commercialName, available: stock.breakdown.available }}
        today={stock.today}
        lots={stock.lots.map((lot) => ({
          id: lot.id,
          lotNumber: lot.lotNumber,
          expiryDate: lot.expiryDate,
          receivedAt: lot.receivedAt.toISOString(),
          currentQuantity: lot.currentQuantity,
          blockedQuantity: lot.blockedQuantity,
          status: lot.status,
        }))}
        reasons={reasons}
        suppliers={suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))}
        allowedTypes={allowedTypes}
        initialType={startType}
        initialLotId={uuidParam(sp.lotId)}
      />
    </div>
  );
}
