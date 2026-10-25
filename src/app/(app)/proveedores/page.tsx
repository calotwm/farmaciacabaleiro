import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/access-denied";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { hasPermission } from "@/modules/auth/domain/permissions";
import { getCurrentUser } from "@/modules/auth/server";
import { SUPPLIER_SORT_FIELDS, SUPPLIER_STATUS_FILTERS } from "@/modules/suppliers/application/ports";
import { getSuppliersModule } from "@/modules/suppliers/composition";
import { SupplierFilters } from "@/modules/suppliers/ui/supplier-filters";
import { SuppliersTable } from "@/modules/suppliers/ui/suppliers-table";
import { DEFAULT_PAGE_SIZE, firstParam, parseOption, parsePage, parseSortDirection, type SearchParams } from "@/shared/application/list-query";

export const metadata: Metadata = { title: "Proveedores - Farmacia Cabaleiro" };

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user, "suppliers.read")) return <AccessDenied message="No tenés permiso para ver los proveedores." />;

  const sp = await searchParams;
  const query = {
    search: firstParam(sp.q),
    status: parseOption(sp.status, SUPPLIER_STATUS_FILTERS, ""),
    sort: parseOption(sp.sort, SUPPLIER_SORT_FIELDS, "name"),
    dir: parseSortDirection(sp.dir, "asc"),
    page: parsePage(sp.page),
    pageSize: DEFAULT_PAGE_SIZE,
  };
  const { items, total } = await getSuppliersModule().supplierService.listSuppliers(user, query);
  const params = { q: query.search, status: query.status || undefined };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Proveedores</h1>
        {hasPermission(user, "suppliers.write") ? (
          <Button asChild>
            <Link href="/proveedores/nuevo">Nuevo proveedor</Link>
          </Button>
        ) : null}
      </div>
      <SupplierFilters values={{ ...params, sort: query.sort, dir: query.dir }} />
      <SuppliersTable suppliers={items} sort={query.sort} dir={query.dir} params={params} />
      <Pagination basePath="/proveedores" params={{ ...params, sort: query.sort, dir: query.dir }} page={query.page} pageSize={query.pageSize} total={total} />
    </div>
  );
}
