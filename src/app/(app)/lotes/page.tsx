import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import Link from "next/link";
import { AccessDenied } from "@/components/access-denied";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { hasPermission } from "@/modules/auth/domain/permissions";
import { getCurrentUser } from "@/modules/auth/server";
import { getCatalogModule } from "@/modules/catalog/composition";
import { LOT_SORT_FIELDS, LOT_STATUS_FILTERS } from "@/modules/inventory/application/ports";
import { getInventoryModule } from "@/modules/inventory/composition";
import { LotFilters } from "@/modules/inventory/ui/lot-filters";
import { LotsTable } from "@/modules/inventory/ui/lots-table";
import {
  DEFAULT_PAGE_SIZE,
  buildHref,
  firstParam,
  parseOption,
  parsePage,
  parseSortDirection,
  type SearchParams,
  uuidParam,
} from "@/shared/application/list-query";
import { readGeneralSettings } from "@/modules/settings/infrastructure/read-general-settings";
import { isValidCalendarDate } from "@/shared/domain/dates";
import { prisma } from "@/shared/infrastructure/db/prisma";

export const metadata: Metadata = { title: "Lotes - Farmacia Cabaleiro" };

function validDate(value: string | string[] | undefined): string | undefined {
  const date = firstParam(value);
  return date && isValidCalendarDate(date) ? date : undefined;
}

export default async function LotsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user, "inventory.read")) return <AccessDenied message="No tenés permiso para ver los lotes." />;

  const sp = await searchParams;
  const { stockQueries } = getInventoryModule();
  const { catalogService, taxonomyService } = getCatalogModule();

  const query = {
    search: firstParam(sp.search),
    productId: uuidParam(sp.productId),
    categoryId: uuidParam(sp.categoryId),
    supplierId: uuidParam(sp.supplierId),
    status: parseOption(sp.status, LOT_STATUS_FILTERS, ""),
    expiryFrom: validDate(sp.expiryFrom),
    expiryTo: validDate(sp.expiryTo),
    withStock: firstParam(sp.withStock) === "1",
    sort: parseOption(sp.sort, LOT_SORT_FIELDS, "expiry"),
    dir: parseSortDirection(sp.dir, "asc"),
    page: parsePage(sp.page),
    pageSize: DEFAULT_PAGE_SIZE,
  };

  const [{ items, total, today }, categories, suppliers, product] = await Promise.all([
    stockQueries.listLots(user, query),
    hasPermission(user, "products.read") ? taxonomyService.list(user, "category") : Promise.resolve([]),
    stockQueries.listSupplierOptions(user),
    query.productId && hasPermission(user, "products.read")
      ? catalogService.getProduct(user, query.productId).catch(() => null)
      : Promise.resolve(null),
  ]);

  const { expiryThresholds: thresholds } = await readGeneralSettings(prisma);
  const params = {
    search: query.search,
    productId: query.productId,
    categoryId: query.categoryId,
    supplierId: query.supplierId,
    status: query.status || undefined,
    expiryFrom: query.expiryFrom,
    expiryTo: query.expiryTo,
    withStock: query.withStock ? "1" : undefined,
  };

  return (
    <div className="grid gap-4">
      <PageHeader
        title="Lotes"
        description="Cada lote con su vencimiento, cantidad y estado."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <a href={buildHref("/api/export/lotes", { ...params, sort: query.sort, dir: query.dir })}>Exportar CSV</a>
            </Button>
            {hasPermission(user, "inventory.write") ? (
              <Button asChild>
                <Link href="/movimientos/nuevo?type=ENTRY">Ingresar lote</Link>
              </Button>
            ) : null}
          </div>
        }
      />
      <LotFilters
        values={{ ...params, sort: query.sort, dir: query.dir }}
        productName={product?.commercialName}
        categories={categories.map((c) => ({ value: c.id, label: c.name }))}
        suppliers={suppliers.map((s) => ({ value: s.id, label: s.name }))}
      />
      <LotsTable lots={items} today={today} thresholds={thresholds} sort={query.sort} dir={query.dir} params={params} />
      <Pagination basePath="/lotes" params={{ ...params, sort: query.sort, dir: query.dir }} page={query.page} pageSize={query.pageSize} total={total} />
    </div>
  );
}
