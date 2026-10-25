import type { NextRequest } from "next/server";
import { requirePermission } from "@/modules/auth/server";
import { PRODUCT_SORT_FIELDS, PRODUCT_STATUS_FILTERS } from "@/modules/catalog/application/ports";
import { getCatalogModule } from "@/modules/catalog/composition";
import { getInventoryModule } from "@/modules/inventory/composition";
import { type StockBreakdown, computeStockBreakdown } from "@/modules/inventory/domain/stock-breakdown";
import type { LotListItem } from "@/modules/inventory/application/ports";
import { firstParam, parseOption, parseSortDirection, uuidParam } from "@/shared/application/list-query";
import { collectAll, csvDownload } from "@/shared/infrastructure/csv-response";

export const dynamic = "force-dynamic";

const STATUS_LABELS = { ACTIVE: "Activo", INACTIVE: "Inactivo", ARCHIVED: "Archivado" } as const;

// Same filters as /productos. Stock columns come from the lots, so inventory.read is needed too.
export async function GET(request: NextRequest) {
  const sp = Object.fromEntries(request.nextUrl.searchParams);
  return csvDownload("inventario", async () => {
    const user = await requirePermission("products.read");
    await requirePermission("inventory.read");
    const { catalogService } = getCatalogModule();
    const { stockQueries } = getInventoryModule();

    const query = {
      search: firstParam(sp.q),
      categoryId: uuidParam(sp.categoryId),
      supplierId: uuidParam(sp.supplierId),
      status: parseOption(sp.status, PRODUCT_STATUS_FILTERS, ""),
      stock: parseOption(sp.stock, ["", "low", "out"] as const, "") || undefined,
      sort: parseOption(sp.sort, PRODUCT_SORT_FIELDS, "name"),
      dir: parseSortDirection(sp.dir, "asc"),
    };
    const products = await collectAll((page, pageSize) => catalogService.listProducts(user, { ...query, page, pageSize }));

    let today = "";
    const lots = await collectAll(async (page, pageSize) => {
      const result = await stockQueries.listLots(user, { status: "ALL", withStock: true, sort: "expiry", dir: "asc", page, pageSize });
      today = result.today;
      return result;
    });
    const byProduct = new Map<string, LotListItem[]>();
    for (const lot of lots) byProduct.set(lot.productId, [...(byProduct.get(lot.productId) ?? []), lot]);
    const empty: StockBreakdown = { physical: 0, blocked: 0, expired: 0, available: 0 };

    return {
      headers: ["Código", "Producto", "Categoría", "Unidad", "Stock físico", "Disponible", "Bloqueado", "Vencido", "Stock mínimo", "Estado"],
      rows: products.map((p) => {
        const stock = byProduct.has(p.id) ? computeStockBreakdown(byProduct.get(p.id) ?? [], today) : empty;
        return [p.code, p.commercialName, p.categoryName, p.unitName, stock.physical, stock.available, stock.blocked, stock.expired, p.minStock, STATUS_LABELS[p.status]];
      }),
    };
  });
}
