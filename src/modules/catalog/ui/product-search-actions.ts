"use server";

import { requireUser } from "@/modules/auth/server";
import { normalizeBarcode } from "@/shared/domain/barcode";
import { isDomainError } from "@/shared/domain/errors";
import { getCatalogModule } from "../composition";

export interface ProductHit {
  id: string;
  code: string;
  name: string;
  barcode: string | null;
  unitName: string;
}

const MAX_RESULTS = 8;

/**
 * Product lookup for pickers (supplier products, delivery items, receipt lines): an exact barcode wins,
 * otherwise a text search over name, ingredient, brand, code, SKU and barcode. Archived products are
 * never offered. Needs `products.read` (enforced by the catalog service); without it the answer is empty.
 */
export async function searchProductsAction(query: string): Promise<ProductHit[]> {
  const text = query.trim();
  if (text.length < 2 || text.length > 100) return [];
  const actor = await requireUser();
  const { catalogService } = getCatalogModule();
  try {
    const exact = await catalogService.findByBarcode(actor, normalizeBarcode(text));
    const products = exact
      ? [exact]
      : (await catalogService.listProducts(actor, { search: text, status: "", sort: "name", dir: "asc", page: 1, pageSize: MAX_RESULTS })).items;
    return products
      .filter((product) => product.status !== "ARCHIVED")
      .map((product) => ({ id: product.id, code: product.code, name: product.commercialName, barcode: product.barcode, unitName: product.unitName }));
  } catch (error) {
    if (isDomainError(error)) return [];
    throw error;
  }
}
