import type { Metadata } from "next";
import { AccessDenied } from "@/components/access-denied";
import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { hasPermission } from "@/modules/auth/domain/permissions";
import { getCurrentUser } from "@/modules/auth/server";
import { getCatalogModule } from "@/modules/catalog/composition";
import { getInventoryModule } from "@/modules/inventory/composition";
import { bucketFilters, expirationBuckets, resolveBucket, upcomingMonths } from "@/modules/inventory/domain/expiration-views";
import { ExpirationFilters } from "@/modules/inventory/ui/expiration-filters";
import { ExpirationSummaryStrip } from "@/modules/inventory/ui/expiration-summary-strip";
import { ExpirationsByMonthChart } from "@/modules/inventory/ui/expirations-by-month-chart";
import { ExpirationsTable } from "@/modules/inventory/ui/expirations-table";
import { readGeneralSettings } from "@/modules/settings/infrastructure/read-general-settings";
import { buildHref, firstParam, parsePage, type SearchParams, uuidParam } from "@/shared/application/list-query";
import { todayInTz } from "@/shared/domain/dates";
import { prisma } from "@/shared/infrastructure/db/prisma";

export const metadata: Metadata = { title: "Vencimientos - Farmacia Cabaleiro" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;
const CHART_MONTHS = 6;

export default async function ExpirationsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user, "inventory.read")) return <AccessDenied message="No tenés permiso para ver los vencimientos." />;

  const sp = await searchParams;
  const { stockQueries } = getInventoryModule();
  const { taxonomyService } = getCatalogModule();
  const { expiryThresholds } = await readGeneralSettings(prisma);

  const today = todayInTz();
  const buckets = expirationBuckets(Math.max(...expiryThresholds));
  const bucket = resolveBucket(buckets, firstParam(sp.bucket));
  const filters = { search: firstParam(sp.search), categoryId: uuidParam(sp.categoryId), supplierId: uuidParam(sp.supplierId) };
  const page = parsePage(sp.page);
  const months = upcomingMonths(today, CHART_MONTHS);

  const [{ summary }, list, categories, suppliers] = await Promise.all([
    stockQueries.expirationSummary(user, {
      windows: buckets.flatMap((b) => (b.days === null ? [] : [b.days])),
      ranges: months,
      ...filters,
    }),
    stockQueries.listLots(user, { ...filters, ...bucketFilters(bucket, today), withStock: true, sort: "expiry", dir: "asc", page, pageSize: PAGE_SIZE }),
    hasPermission(user, "products.read") ? taxonomyService.list(user, "category") : Promise.resolve([]),
    stockQueries.listSupplierOptions(user),
  ]);

  const items = buckets.map((b) => {
    const figures = b.days === null ? summary.expired : summary.windows.find((w) => w.days === b.days);
    return { bucket: b, lots: figures?.lots ?? 0, units: figures?.units ?? 0 };
  });
  const bars = months.map((month) => {
    const figures = summary.ranges.find((range) => range.key === month.key);
    return { key: month.key, label: month.label, lots: figures?.lots ?? 0, units: figures?.units ?? 0 };
  });

  const baseParams = { search: filters.search, categoryId: filters.categoryId, supplierId: filters.supplierId };
  const exportHref = buildHref("/api/export/lotes", { ...baseParams, ...bucketFilters(bucket, today), withStock: "1", sort: "expiry", dir: "asc" });
  const empty =
    bucket.days === null
      ? "No hay lotes vencidos con stock con estos filtros."
      : `No hay lotes con stock que venzan en los próximos ${bucket.days} días con estos filtros.`;

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Vencimientos"
        description="Lotes con stock vencidos o próximos a vencer, del más urgente al más lejano."
        actions={
          <Button asChild variant="outline">
            <a href={exportHref}>Exportar CSV</a>
          </Button>
        }
      />
      <ExpirationSummaryStrip items={items} activeId={bucket.id} params={baseParams} />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid gap-4">
          <ExpirationFilters
            bucket={bucket.id}
            values={filters}
            categories={categories.map((c) => ({ value: c.id, label: c.name }))}
            suppliers={suppliers.map((s) => ({ value: s.id, label: s.name }))}
          />
          <h2 className="sr-only">{bucket.label}</h2>
          <ExpirationsTable lots={list.items} today={today} thresholds={expiryThresholds} emptyMessage={empty} />
          <Pagination basePath="/vencimientos" params={{ ...baseParams, bucket: bucket.id }} page={page} pageSize={PAGE_SIZE} total={list.total} />
        </div>
        <ExpirationsByMonthChart months={bars} />
      </div>
    </div>
  );
}
