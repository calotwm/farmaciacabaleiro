import type { NextRequest } from "next/server";
import { requirePermission } from "@/modules/auth/server";
import { LOT_SORT_FIELDS, LOT_STATUS_FILTERS } from "@/modules/inventory/application/ports";
import { getInventoryModule } from "@/modules/inventory/composition";
import { describeLot } from "@/modules/inventory/domain/lot";
import { readGeneralSettings } from "@/modules/settings/infrastructure/read-general-settings";
import { dateParam, firstParam, parseOption, parseSortDirection, uuidParam } from "@/shared/application/list-query";
import { daysUntil, formatDate } from "@/shared/domain/dates";
import { collectAll, csvDownload } from "@/shared/infrastructure/csv-response";
import { prisma } from "@/shared/infrastructure/db/prisma";

export const dynamic = "force-dynamic";

const EXPIRY_LABELS = { NORMAL: "Normal", WARNING: "Advertencia", CRITICAL: "Crítico", EXPIRED: "Vencido" } as const;
const HELD_LABELS = { QUARANTINE: "Cuarentena", BLOCKED: "Bloqueado", DEPLETED: "Agotado" } as const;

// Same filters as /lotes.
export async function GET(request: NextRequest) {
  const sp = Object.fromEntries(request.nextUrl.searchParams);
  return csvDownload("lotes", async () => {
    const user = await requirePermission("inventory.read");
    const { stockQueries } = getInventoryModule();
    const query = {
      search: firstParam(sp.search),
      productId: uuidParam(sp.productId),
      categoryId: uuidParam(sp.categoryId),
      supplierId: uuidParam(sp.supplierId),
      status: parseOption(sp.status, LOT_STATUS_FILTERS, ""),
      expiryFrom: dateParam(sp.expiryFrom),
      expiryTo: dateParam(sp.expiryTo),
      withStock: firstParam(sp.withStock) === "1",
      sort: parseOption(sp.sort, LOT_SORT_FIELDS, "expiry"),
      dir: parseSortDirection(sp.dir, "asc"),
    };
    let today = "";
    const lots = await collectAll(async (page, pageSize) => {
      const result = await stockQueries.listLots(user, { ...query, page, pageSize });
      today = result.today;
      return result;
    });
    const { expiryThresholds: thresholds } = await readGeneralSettings(prisma);

    return {
      headers: ["Producto", "Lote", "Vencimiento", "Días restantes", "Cantidad", "Proveedor", "Estado"],
      rows: lots.map((lot) => {
        const { effectiveStatus, expiry } = describeLot(lot, today, { thresholds });
        const held = effectiveStatus === "QUARANTINE" || effectiveStatus === "BLOCKED" || effectiveStatus === "DEPLETED" ? effectiveStatus : null;
        const status = [EXPIRY_LABELS[expiry.status], held ? HELD_LABELS[held] : null].filter(Boolean).join(" / ");
        return [lot.productName, lot.lotNumber, formatDate(lot.expiryDate), daysUntil(lot.expiryDate, today), lot.currentQuantity, lot.supplierName, status];
      }),
    };
  });
}
