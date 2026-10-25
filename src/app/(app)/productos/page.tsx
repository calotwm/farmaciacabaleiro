import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccessDenied } from "@/components/access-denied";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { hasPermission } from "@/modules/auth/domain/permissions";
import { getCurrentUser } from "@/modules/auth/server";
import { PRODUCT_SORT_FIELDS, PRODUCT_STATUS_FILTERS } from "@/modules/catalog/application/ports";
import { getCatalogModule } from "@/modules/catalog/composition";
import { ProductFilters } from "@/modules/catalog/ui/product-filters";
import { ProductsTable } from "@/modules/catalog/ui/products-table";
import {
  DEFAULT_PAGE_SIZE,
  firstParam,
  parseOption,
  parsePage,
  parseSortDirection,
  type SearchParams,
  uuidParam,
} from "@/shared/application/list-query";
import { normalizeBarcode } from "@/shared/domain/barcode";

export const metadata: Metadata = { title: "Productos - Farmacia Cabaleiro" };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user, "products.read")) return <AccessDenied message="No tenés permiso para ver los productos." />;

  const sp = await searchParams;
  const { catalogService, taxonomyService } = getCatalogModule();
  const search = firstParam(sp.q);

  // A scanned barcode that matches a product goes straight to it (no click needed).
  if (search) {
    const hit = await catalogService.findByBarcode(user, normalizeBarcode(search));
    if (hit) redirect(`/productos/${hit.id}`);
  }

  const query = {
    search,
    categoryId: uuidParam(sp.categoryId),
    supplierId: uuidParam(sp.supplierId),
    status: parseOption(sp.status, PRODUCT_STATUS_FILTERS, ""),
    sort: parseOption(sp.sort, PRODUCT_SORT_FIELDS, "name"),
    dir: parseSortDirection(sp.dir, "asc"),
    page: parsePage(sp.page),
    pageSize: DEFAULT_PAGE_SIZE,
  };
  const [{ items, total }, categories, suppliers] = await Promise.all([
    catalogService.listProducts(user, query),
    taxonomyService.list(user, "category"),
    catalogService.listSupplierOptions(user),
  ]);

  const params = { q: query.search, categoryId: query.categoryId, supplierId: query.supplierId, status: query.status || undefined };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Productos</h1>
        {hasPermission(user, "products.write") ? (
          <Button asChild>
            <Link href="/productos/nuevo">Nuevo producto</Link>
          </Button>
        ) : null}
      </div>
      <ProductFilters
        values={{ ...params, sort: query.sort, dir: query.dir }}
        categories={categories.map((c) => ({ value: c.id, label: c.active ? c.name : `${c.name} (inactiva)` }))}
        suppliers={suppliers.map((s) => ({ value: s.id, label: s.name }))}
      />
      <ProductsTable products={items} sort={query.sort} dir={query.dir} params={params} />
      <Pagination
        basePath="/productos"
        params={{ ...params, sort: query.sort, dir: query.dir }}
        page={query.page}
        pageSize={query.pageSize}
        total={total}
      />
    </div>
  );
}
