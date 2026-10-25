import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/access-denied";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { hasPermission } from "@/modules/auth/domain/permissions";
import { getCurrentUser } from "@/modules/auth/server";
import { getCatalogModule } from "@/modules/catalog/composition";
import { getInventoryModule } from "@/modules/inventory/composition";
import { MOVEMENT_TYPES, type MovementType } from "@/modules/inventory/domain/movement-type";
import { MovementFilters } from "@/modules/inventory/ui/movement-filters";
import { MovementsTable } from "@/modules/inventory/ui/movements-table";
import { DEFAULT_PAGE_SIZE, firstParam, parsePage, type SearchParams, uuidParam } from "@/shared/application/list-query";
import { isValidCalendarDate } from "@/shared/domain/dates";

export const metadata: Metadata = { title: "Movimientos - Farmacia Cabaleiro" };

function validDate(value: string | string[] | undefined): string | undefined {
  const date = firstParam(value);
  return date && isValidCalendarDate(date) ? date : undefined;
}

const KNOWN_TYPES: readonly string[] = [...MOVEMENT_TYPES, "COUNT_CORRECTION"];

export default async function MovementsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user, "inventory.read")) return <AccessDenied message="No tenés permiso para ver los movimientos." />;

  const sp = await searchParams;
  const { stockQueries } = getInventoryModule();
  const type = firstParam(sp.type);
  const query = {
    search: firstParam(sp.search),
    type: type && KNOWN_TYPES.includes(type) ? (type as MovementType) : undefined,
    productId: uuidParam(sp.productId),
    lotId: uuidParam(sp.lotId),
    userId: uuidParam(sp.userId),
    from: validDate(sp.from),
    to: validDate(sp.to),
    page: parsePage(sp.page),
    pageSize: DEFAULT_PAGE_SIZE,
  };

  const canReadProducts = hasPermission(user, "products.read");
  const [{ items, total }, users, product, lot] = await Promise.all([
    stockQueries.listMovements(user, query),
    stockQueries.listMovementUsers(user),
    query.productId && canReadProducts ? getCatalogModule().catalogService.getProduct(user, query.productId).catch(() => null) : Promise.resolve(null),
    query.lotId ? stockQueries.getLot(user, query.lotId).catch(() => null) : Promise.resolve(null),
  ]);

  const params = {
    search: query.search,
    type: query.type,
    productId: query.productId,
    lotId: query.lotId,
    userId: query.userId,
    from: query.from,
    to: query.to,
  };
  const canRegister = hasPermission(user, "inventory.write") || hasPermission(user, "inventory.writeoff");

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Movimientos</h1>
          <p className="text-muted-foreground text-sm">Historial inmutable: los errores se corrigen con un movimiento compensatorio.</p>
        </div>
        {canRegister ? (
          <Button asChild>
            <Link href="/movimientos/nuevo">Nuevo movimiento</Link>
          </Button>
        ) : null}
      </div>
      <MovementFilters
        values={params}
        users={users.map((u) => ({ value: u.id, label: u.name }))}
        productName={product?.commercialName}
        lotNumber={lot?.lot.lotNumber}
      />
      <MovementsTable movements={items} />
      <Pagination basePath="/movimientos" params={params} page={query.page} pageSize={query.pageSize} total={total} />
    </div>
  );
}
