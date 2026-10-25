import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { AccessDenied } from "@/components/access-denied";
import { Pagination } from "@/components/pagination";
import { hasPermission } from "@/modules/auth/domain/permissions";
import { getCurrentUser } from "@/modules/auth/server";
import { getCatalogModule } from "@/modules/catalog/composition";
import { getInventoryModule } from "@/modules/inventory/composition";
import { CountsTable } from "@/modules/inventory/ui/counts-table";
import { OpenCountForm } from "@/modules/inventory/ui/open-count-form";
import { DEFAULT_PAGE_SIZE, parsePage, type SearchParams } from "@/shared/application/list-query";

export const metadata: Metadata = { title: "Conteos - Farmacia Cabaleiro" };

export default async function CountsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user, "inventory.count")) return <AccessDenied message="No tenés permiso para hacer conteos de stock." />;

  const page = parsePage((await searchParams).page);
  const [{ items, total }, categories] = await Promise.all([
    getInventoryModule().stockQueries.listCounts(user, page, DEFAULT_PAGE_SIZE),
    hasPermission(user, "products.read") ? getCatalogModule().taxonomyService.list(user, "category") : Promise.resolve([]),
  ]);

  return (
    <div className="grid gap-6">
      <PageHeader title="Conteos de stock" description="Contá lo que hay en el depósito; al cerrar, las diferencias se corrigen con movimientos." />
      <section className="grid gap-3" aria-labelledby="open-count">
        <h2 id="open-count" className="text-base font-semibold">
          Abrir un conteo
        </h2>
        <OpenCountForm categories={categories.map((c) => ({ value: c.id, label: c.name }))} />
      </section>
      <section className="grid gap-3" aria-labelledby="count-history">
        <h2 id="count-history" className="text-base font-semibold">
          Conteos anteriores
        </h2>
        <CountsTable counts={items} />
        <Pagination basePath="/conteos" params={{}} page={page} pageSize={DEFAULT_PAGE_SIZE} total={total} />
      </section>
    </div>
  );
}
