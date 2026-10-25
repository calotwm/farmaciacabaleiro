import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/access-denied";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { hasPermission } from "@/modules/auth/domain/permissions";
import { getCurrentUser } from "@/modules/auth/server";
import { getInventoryModule } from "@/modules/inventory/composition";
import { LotDetail } from "@/modules/inventory/ui/lot-detail";
import { MovementsTable } from "@/modules/inventory/ui/movements-table";
import { DEFAULT_PAGE_SIZE, parsePage, type SearchParams } from "@/shared/application/list-query";
import { hasErrorCode } from "@/shared/domain/errors";
import { isUuid } from "@/shared/domain/ids";

export const metadata: Metadata = { title: "Lote - Farmacia Cabaleiro" };

export default async function LotPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user, "inventory.read")) return <AccessDenied message="No tenés permiso para ver los lotes." />;

  const { id } = await params;
  if (!isUuid(id)) notFound();
  const page = parsePage((await searchParams).page);
  const { stockQueries } = getInventoryModule();
  const detail = await stockQueries.getLot(user, id).catch((error) => {
    if (hasErrorCode(error, "NOT_FOUND")) return null;
    throw error;
  });
  if (!detail) notFound();

  const { lot, today } = detail;
  const history = await stockQueries.listMovements(user, { lotId: id, page, pageSize: DEFAULT_PAGE_SIZE });
  const newMovement = (type: string) => `/movimientos/nuevo?productId=${lot.productId}&lotId=${lot.id}&type=${type}`;
  const canWrite = hasPermission(user, "inventory.write");
  const canWriteOff = hasPermission(user, "inventory.writeoff");

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Lote {lot.lotNumber}</h1>
          <p>
            <Link href={`/productos/${lot.productId}`} className="text-muted-foreground underline underline-offset-4">
              {lot.productName}
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canWrite ? (
            <>
              <Button asChild variant="outline">
                <Link href={newMovement("EXIT")}>Registrar salida</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={newMovement("BLOCK")}>Bloquear</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={newMovement("UNBLOCK")}>Desbloquear</Link>
              </Button>
            </>
          ) : null}
          {canWriteOff ? (
            <Button asChild variant="outline">
              <Link href={newMovement("WRITE_OFF")}>Dar de baja</Link>
            </Button>
          ) : null}
        </div>
      </div>
      <LotDetail lot={lot} today={today} />
      <section className="grid gap-3" aria-labelledby="lot-history">
        <h2 id="lot-history" className="text-lg font-medium">
          Historial de movimientos
        </h2>
        <MovementsTable movements={history.items} />
        <Pagination basePath={`/lotes/${id}`} params={{}} page={page} pageSize={DEFAULT_PAGE_SIZE} total={history.total} />
      </section>
    </div>
  );
}
