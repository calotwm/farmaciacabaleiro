import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/access-denied";
import { Badge } from "@/components/ui/badge";
import { hasPermission } from "@/modules/auth/domain/permissions";
import { getCurrentUser } from "@/modules/auth/server";
import { getInventoryModule } from "@/modules/inventory/composition";
import { summarizeCount } from "@/modules/inventory/domain/stock-count";
import { ClosedCountTable } from "@/modules/inventory/ui/closed-count-table";
import { CountSheet } from "@/modules/inventory/ui/count-sheet";
import { formatDateTime } from "@/shared/domain/dates";
import { hasErrorCode } from "@/shared/domain/errors";
import { isUuid } from "@/shared/domain/ids";

export const metadata: Metadata = { title: "Conteo - Farmacia Cabaleiro" };

export default async function CountPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user, "inventory.count")) return <AccessDenied message="No tenés permiso para hacer conteos de stock." />;

  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { stockQueries } = getInventoryModule();
  const detail = await stockQueries.getCount(user, id).catch((error) => {
    if (hasErrorCode(error, "NOT_FOUND")) return null;
    throw error;
  });
  if (!detail) notFound();

  const { count, today } = detail;
  const open = count.status === "OPEN";
  const reasons = open ? (await stockQueries.listReasons(user, "ADJUSTMENT")).map((r) => ({ value: r.id, label: r.name })) : [];
  const summary = summarizeCount(count.lines.map((line) => ({ expectedQuantity: line.expectedQuantity, countedQuantity: line.countedQuantity })));

  return (
    <div className="grid gap-4">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">Conteo del {formatDateTime(count.createdAt)}</h1>
          <Badge variant={open ? "default" : "secondary"}>{open ? "Abierto" : "Cerrado"}</Badge>
        </div>
        <p className="text-muted-foreground text-sm">
          {count.createdByName} · {count.notes ?? "Todos los lotes con stock"}
          {count.closedAt ? ` · Cerrado el ${formatDateTime(count.closedAt)}` : ""}
        </p>
        <p className="text-sm">
          <Link href="/conteos" className="underline underline-offset-4">
            Volver a los conteos
          </Link>
        </p>
      </div>

      {open ? (
        <CountSheet
          countId={count.id}
          lines={count.lines}
          today={today}
          reasons={reasons}
          canClose={hasPermission(user, "inventory.write")}
        />
      ) : (
        <>
          <p role="status" data-testid="count-closed-summary">
            Conteo cerrado: {summary.counted} lotes contados, {summary.withDifference} con diferencias, {summary.uncounted} sin contar. Las
            correcciones están en{" "}
            <Link href={`/movimientos?type=COUNT_CORRECTION_IN`} className="underline underline-offset-4">
              Movimientos
            </Link>
            . Un conteo cerrado no se puede modificar.
          </p>
          <ClosedCountTable lines={count.lines} today={today} />
        </>
      )}
    </div>
  );
}
