import type { CalendarDate } from "@/shared/domain/dates";
import type { LotState, LotStatus } from "../domain/lot";
import type { PlannedLotUpdate } from "../domain/movement-rules";
import type { MovementType, ReasonKind } from "../domain/movement-type";

// ---------------------------------------------------------------------------
// Write side: one transaction per operation
// ---------------------------------------------------------------------------

export interface LockedProduct {
  id: string;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  commercialName: string;
}

export interface NewLotData {
  productId: string;
  lotNumber: string;
  expiryDate: CalendarDate;
  quantity: number;
  unitCost: string | null;
  supplierId: string | null;
  invoiceNumber: string | null;
  location: string | null;
  notes: string | null;
  /** The receipt line this lot was created from (goods receiving). */
  receiptLineId?: string | null;
}

export interface NewMovementData {
  type: MovementType;
  lotId: string;
  productId: string;
  quantity: number;
  balanceAfter: number;
  reasonId: string | null;
  reasonText: string | null;
  userId: string;
  occurredAt: Date;
  /** What produced the movement (e.g. "stock_count" + the count id). */
  referenceType?: string | null;
  referenceId?: string | null;
}

export interface MovementRef {
  id: string;
  type: MovementType;
  lotId: string;
  quantity: number;
  balanceAfter: number;
}

export interface ReasonRecord {
  id: string;
  name: string;
  kind: ReasonKind;
  active: boolean;
}

export interface CountRecord {
  id: string;
  status: "OPEN" | "CLOSED";
  createdById: string;
  notes: string | null;
  closedAt: Date | null;
}

export interface CountLineRecord {
  id: string;
  lotId: string;
  productId: string;
  expectedQuantity: number;
  countedQuantity: number | null;
  difference: number | null;
  reconciled: boolean;
}

export interface CountScope {
  categoryId?: string;
  location?: string;
}

/** Operations available inside one stock transaction. */
export interface StockTx {
  /**
   * Locks the product row (`SELECT ... FOR NO KEY UPDATE`): every stock operation on a product is
   * serialized through it, so two concurrent exits can never drive a lot below zero.
   * Must be called before reading lots that the operation will change.
   */
  lockProduct(productId: string): Promise<LockedProduct | null>;
  findLot(lotId: string): Promise<LotState | null>;
  /** All lots of the product, read AFTER the lock so the values are current. */
  listLots(productId: string): Promise<LotState[]>;
  findLotByKey(productId: string, lotNumber: string, expiryDate: CalendarDate): Promise<LotState | null>;
  createLot(data: NewLotData, receivedAt: Date): Promise<LotState>;
  updateLots(updates: readonly PlannedLotUpdate[]): Promise<void>;
  addMovements(movements: readonly NewMovementData[]): Promise<MovementRef[]>;
  findReason(id: string): Promise<ReasonRecord | null>;

  // Physical counts
  /** Locks the count row (`FOR UPDATE`): serializes saving lines against closing, and a second close against the first. */
  lockCount(countId: string): Promise<CountRecord | null>;
  /** Lots with units on hand that match the scope (a snapshot candidate list), plus the category name when filtered. */
  listLotsForCount(scope: CountScope): Promise<{ lots: LotState[]; categoryName: string | null }>;
  createCount(data: { createdById: string; notes: string | null }, lines: ReadonlyArray<{ lot: LotState }>): Promise<CountRecord>;
  listCountLines(countId: string): Promise<CountLineRecord[]>;
  setCountedQuantity(lineId: string, countedQuantity: number | null, difference: number | null): Promise<void>;
  reconcileCountLine(lineId: string, difference: number): Promise<void>;
  closeCount(countId: string, closedAt: Date): Promise<void>;
}

export interface StockUnitOfWork {
  /** Runs `work` in a single database transaction (rolled back if it throws). */
  run<T>(work: (tx: StockTx) => Promise<T>): Promise<T>;
}

/** Port for low/out-of-stock alerts. Called after a movement commits; T4 reuses and extends it. */
export interface StockLevelAlerts {
  evaluate(productId: string, today: CalendarDate): Promise<void>;
}

// ---------------------------------------------------------------------------
// Read side
// ---------------------------------------------------------------------------

export const LOT_SORT_FIELDS = ["expiry", "product", "lotNumber", "quantity", "receivedAt"] as const;
export type LotSortField = (typeof LOT_SORT_FIELDS)[number];

/** "" = lots with stock, "ALL" = every lot including depleted ones. */
export const LOT_STATUS_FILTERS = ["", "AVAILABLE", "QUARANTINE", "BLOCKED", "EXPIRED", "DEPLETED", "ALL"] as const;
export type LotStatusFilter = (typeof LOT_STATUS_FILTERS)[number];

export interface LotListQuery {
  /** Matches the lot number or the product (name, active ingredient, brand, barcode, SKU, code). */
  search?: string;
  productId?: string;
  categoryId?: string;
  supplierId?: string;
  status: LotStatusFilter;
  expiryFrom?: CalendarDate;
  expiryTo?: CalendarDate;
  sort: LotSortField;
  dir: "asc" | "desc";
  page: number;
  pageSize: number;
  /** "Today" in the pharmacy timezone, used to resolve the effective (expired) state. */
  today: CalendarDate;
}

export interface LotListItem extends LotState {
  productCode: string;
  productName: string;
  unitName: string;
  supplierId: string | null;
  supplierName: string | null;
  invoiceNumber: string | null;
  location: string | null;
  unitCost: string | null;
  notes: string | null;
  initialQuantity: number;
}

export const MOVEMENT_SORT_FIELDS = ["occurredAt"] as const;

export interface MovementListQuery {
  /** Matches the lot number or the product (name, active ingredient, brand, barcode, SKU, code). */
  search?: string;
  type?: MovementType;
  productId?: string;
  lotId?: string;
  userId?: string;
  /** Inclusive calendar-day range in the pharmacy timezone. */
  from?: CalendarDate;
  to?: CalendarDate;
  page: number;
  pageSize: number;
}

export interface MovementListItem {
  id: string;
  type: MovementType;
  occurredAt: Date;
  quantity: number;
  balanceAfter: number;
  productId: string;
  productName: string;
  lotId: string;
  lotNumber: string;
  reasonName: string | null;
  reasonText: string | null;
  userName: string;
}

export interface Page<T> {
  items: T[];
  total: number;
}

export interface CountListItem {
  id: string;
  status: "OPEN" | "CLOSED";
  createdByName: string;
  notes: string | null;
  createdAt: Date;
  closedAt: Date | null;
  totalLines: number;
  countedLines: number;
}

export interface CountLineView {
  id: string;
  lotId: string;
  lotNumber: string;
  expiryDate: CalendarDate;
  lotStatus: LotStatus;
  productId: string;
  productName: string;
  productCode: string;
  barcode: string | null;
  sku: string | null;
  location: string | null;
  expectedQuantity: number;
  countedQuantity: number | null;
  /** Stored difference: counted - expected while open, counted - lot quantity at reconciliation once closed. */
  difference: number | null;
  reconciled: boolean;
  /** What the lot holds right now (it can differ from the snapshot if movements happened meanwhile). */
  currentQuantity: number;
}

export interface CountDetail extends CountListItem {
  lines: CountLineView[];
}

export interface StockReadRepository {
  listCounts(page: number, pageSize: number): Promise<Page<CountListItem>>;
  getCount(id: string): Promise<CountDetail | null>;
  listLots(query: LotListQuery): Promise<Page<LotListItem>>;
  getLot(id: string): Promise<LotListItem | null>;
  /** Every lot of a product (including depleted/expired), for the stock breakdown and FEFO table. */
  listProductLots(productId: string): Promise<LotListItem[]>;
  listMovements(query: MovementListQuery): Promise<Page<MovementListItem>>;
  listReasons(kind?: ReasonKind): Promise<ReasonRecord[]>;
  /** Users who authored at least one movement (history filter). */
  listMovementUsers(): Promise<Array<{ id: string; name: string }>>;
  listSupplierOptions(): Promise<Array<{ id: string; name: string }>>;
}

export type { LotState, LotStatus };
