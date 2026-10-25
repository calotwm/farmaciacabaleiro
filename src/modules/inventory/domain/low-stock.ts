export type StockAlertRule = "LOW_STOCK" | "OUT_OF_STOCK";

/**
 * Which stock alert (if any) a product is in, from its available units.
 * Nothing available is OUT_OF_STOCK; at or below the minimum is LOW_STOCK. Only one applies at a time.
 */
export function evaluateStockLevel(available: number, minStock: number): StockAlertRule | null {
  if (available <= 0) return "OUT_OF_STOCK";
  if (available <= minStock) return "LOW_STOCK";
  return null;
}
