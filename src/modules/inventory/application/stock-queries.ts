import { type AuthUser, assertPermission } from "@/modules/auth/domain/permissions";
import { type CalendarDate, todayInTz } from "@/shared/domain/dates";
import { NotFoundError } from "@/shared/domain/errors";
import { firstUsableLot, sortFefo } from "../domain/fefo";
import type { ReasonKind } from "../domain/movement-type";
import { type StockBreakdown, computeStockBreakdown } from "../domain/stock-breakdown";
import type { LotListItem, LotListQuery, MovementListQuery, StockReadRepository } from "./ports";

export interface StockQueriesDeps {
  reads: StockReadRepository;
  now?: () => Date;
}

export interface ProductStock {
  today: CalendarDate;
  breakdown: StockBreakdown;
  /** Lots with units on hand (plus expired ones still holding stock), earliest expiry first. */
  lots: LotListItem[];
  /** The lot to dispense first ("Usar primero"), or null when nothing can be dispensed. */
  firstUsableLotId: string | null;
}

/** Read use cases of the inventory module (all need `inventory.read`). */
export function createStockQueries({ reads, now = () => new Date() }: StockQueriesDeps) {
  const today = () => todayInTz(now());

  async function listLots(actor: AuthUser, query: Omit<LotListQuery, "today">) {
    assertPermission(actor, "inventory.read");
    const current = today();
    return { today: current, ...(await reads.listLots({ ...query, today: current })) };
  }

  async function getLot(actor: AuthUser, id: string) {
    assertPermission(actor, "inventory.read");
    const lot = await reads.getLot(id);
    if (!lot) throw new NotFoundError("lot");
    return { today: today(), lot };
  }

  /** Stock breakdown and FEFO-ordered lots of one product, derived from its lots. */
  async function getProductStock(actor: AuthUser, productId: string): Promise<ProductStock> {
    assertPermission(actor, "inventory.read");
    const current = today();
    const all = await reads.listProductLots(productId);
    const lots = sortFefo(all.filter((lot) => lot.currentQuantity > 0));
    return {
      today: current,
      breakdown: computeStockBreakdown(all, current),
      lots,
      firstUsableLotId: firstUsableLot(lots, current)?.id ?? null,
    };
  }

  async function listMovements(actor: AuthUser, query: MovementListQuery) {
    assertPermission(actor, "inventory.read");
    return reads.listMovements(query);
  }

  async function listReasons(actor: AuthUser, kind?: ReasonKind) {
    assertPermission(actor, "inventory.read");
    return (await reads.listReasons(kind)).filter((reason) => reason.active);
  }

  async function listMovementUsers(actor: AuthUser) {
    assertPermission(actor, "inventory.read");
    return reads.listMovementUsers();
  }

  async function listSupplierOptions(actor: AuthUser) {
    assertPermission(actor, "inventory.read");
    return reads.listSupplierOptions();
  }

  return { listLots, getLot, getProductStock, listMovements, listReasons, listMovementUsers, listSupplierOptions };
}

export type StockQueries = ReturnType<typeof createStockQueries>;
