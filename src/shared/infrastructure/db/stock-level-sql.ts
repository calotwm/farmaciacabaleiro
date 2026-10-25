import { Prisma } from "@/generated/prisma/client";
import type { CalendarDate } from "@/shared/domain/dates";

/**
 * SQL twin of `computeStockBreakdown().available` per ACTIVE product (one row each: id, min_stock, available).
 * Units of expired, quarantined or blocked lots do not count; otherwise on-hand minus individually blocked units.
 * Use as `WITH levels AS (${productStockLevels(today)}) ...`.
 */
export function productStockLevels(today: CalendarDate): Prisma.Sql {
  return Prisma.sql`
    SELECT p.id, p.min_stock,
      COALESCE(SUM(
        CASE WHEN l.expiry_date < ${today}::date OR l.status IN ('EXPIRED', 'QUARANTINE', 'BLOCKED') THEN 0
             ELSE GREATEST(l.current_quantity - l.blocked_quantity, 0) END
      ), 0)::int AS available
    FROM products p
    LEFT JOIN lots l ON l.product_id = p.id
    WHERE p.status = 'ACTIVE'
    GROUP BY p.id, p.min_stock`;
}

export type StockLevelFilter = "low" | "out";

/** Ids of active products that are out of stock (nothing available) or low (available > 0 and <= minimum). */
export async function productIdsAtStockLevel(
  db: { $queryRaw<T>(query: Prisma.Sql): Promise<T> },
  level: StockLevelFilter,
  today: CalendarDate,
): Promise<string[]> {
  const condition = level === "out" ? Prisma.sql`available <= 0` : Prisma.sql`available > 0 AND available <= min_stock`;
  const rows = await db.$queryRaw<{ id: string }[]>(
    Prisma.sql`WITH levels AS (${productStockLevels(today)}) SELECT id FROM levels WHERE ${condition}`,
  );
  return rows.map((row) => row.id);
}
