import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/access-denied";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { hasPermission } from "@/modules/auth/domain/permissions";
import { getCurrentUser } from "@/modules/auth/server";
import { RECEIPT_STATUS_FILTERS } from "@/modules/receiving/application/ports";
import { getReceivingModule } from "@/modules/receiving/composition";
import { ReceiptFilters } from "@/modules/receiving/ui/receipt-filters";
import { ReceiptsTable } from "@/modules/receiving/ui/receipts-table";
import { DEFAULT_PAGE_SIZE, dateParam, firstParam, parseOption, parsePage, type SearchParams, uuidParam } from "@/shared/application/list-query";

export const metadata: Metadata = { title: "Recepciones - Farmacia Cabaleiro" };

export default async function ReceiptsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user, "receiving.read")) return <AccessDenied message="No tenés permiso para ver las recepciones." />;

  const sp = await searchParams;
  const { receivingService } = getReceivingModule();
  const query = {
    supplierId: uuidParam(sp.supplierId),
    status: parseOption(sp.status, RECEIPT_STATUS_FILTERS, ""),
    from: dateParam(sp.from),
    to: dateParam(sp.to),
    withIssues: firstParam(sp.issues) === "1",
    dir: "desc" as const,
    page: parsePage(sp.page),
    pageSize: DEFAULT_PAGE_SIZE,
  };
  const [{ items, total }, suppliers] = await Promise.all([receivingService.listReceipts(user, query), receivingService.listSupplierOptions(user)]);
  const params = {
    supplierId: query.supplierId,
    status: query.status || undefined,
    from: query.from,
    to: query.to,
    issues: query.withIssues ? "1" : undefined,
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Recepciones</h1>
          <p className="text-muted-foreground text-sm">Mercadería recibida de los proveedores. Para recibir un reparto programado, abrilo desde Entregas.</p>
        </div>
        {hasPermission(user, "receiving.write") ? (
          <Button asChild>
            <Link href="/recepciones/nueva">Recepción sin programar</Link>
          </Button>
        ) : null}
      </div>
      <ReceiptFilters
        values={{ supplierId: query.supplierId, status: query.status, from: query.from, to: query.to, withIssues: query.withIssues }}
        suppliers={suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))}
      />
      <ReceiptsTable receipts={items} />
      <Pagination basePath="/recepciones" params={params} page={query.page} pageSize={query.pageSize} total={total} />
    </div>
  );
}
