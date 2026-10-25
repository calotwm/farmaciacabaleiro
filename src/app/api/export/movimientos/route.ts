import type { NextRequest } from "next/server";
import { requirePermission } from "@/modules/auth/server";
import { getInventoryModule } from "@/modules/inventory/composition";
import { HISTORY_MOVEMENT_TYPES, MOVEMENT_TYPE_LABELS, type MovementType, stockDirection } from "@/modules/inventory/domain/movement-type";
import { dateParam, firstParam, uuidParam } from "@/shared/application/list-query";
import { formatDateTime } from "@/shared/domain/dates";
import { collectAll, csvDownload } from "@/shared/infrastructure/csv-response";

export const dynamic = "force-dynamic";

const KNOWN_TYPES: readonly string[] = HISTORY_MOVEMENT_TYPES;

// Same filters as /movimientos.
export async function GET(request: NextRequest) {
  const sp = Object.fromEntries(request.nextUrl.searchParams);
  return csvDownload("movimientos", async () => {
    const user = await requirePermission("inventory.read");
    const { stockQueries } = getInventoryModule();
    const type = firstParam(sp.type);
    const query = {
      search: firstParam(sp.search),
      type: type && KNOWN_TYPES.includes(type) ? (type as MovementType) : undefined,
      productId: uuidParam(sp.productId),
      lotId: uuidParam(sp.lotId),
      userId: uuidParam(sp.userId),
      from: dateParam(sp.from),
      to: dateParam(sp.to),
    };
    const movements = await collectAll((page, pageSize) => stockQueries.listMovements(user, { ...query, page, pageSize }));

    return {
      headers: ["Fecha", "Tipo", "Producto", "Lote", "Cantidad", "Saldo del lote", "Usuario", "Motivo"],
      rows: movements.map((m) => [
        formatDateTime(m.occurredAt),
        MOVEMENT_TYPE_LABELS[m.type],
        m.productName,
        m.lotNumber,
        stockDirection(m.type) < 0 ? -m.quantity : m.quantity,
        m.balanceAfter,
        m.userName,
        [m.reasonName, m.reasonText].filter(Boolean).join(": "),
      ]),
    };
  });
}
