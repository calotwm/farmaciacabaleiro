import type { CalendarDate } from "@/shared/domain/dates";
import type { ComplianceRow } from "../domain/compliance";
import type { DeliveryStatus, DeliveryType } from "../domain/delivery-status";

export interface ExpectedItemRecord {
  productId: string;
  productCode: string;
  productName: string;
  unitName: string;
  expectedQuantity: number;
}

export interface DeliveryRecord {
  id: string;
  supplierId: string;
  supplierName: string;
  /** The instant of the visit; shown in AR time. */
  scheduledAt: Date;
  type: DeliveryType;
  status: DeliveryStatus;
  orderNumber: string | null;
  responsibleUserId: string | null;
  responsibleUserName: string | null;
  notes: string | null;
  /** The delivery this one replaces (set when it was created by a reschedule). */
  rescheduledFromId: string | null;
  /** The delivery that replaced this one, when it was rescheduled. */
  rescheduledToId: string | null;
  expectedItems: ExpectedItemRecord[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ExpectedItemData {
  productId: string;
  expectedQuantity: number;
}

/** Writable delivery fields. */
export interface DeliveryData {
  supplierId: string;
  scheduledAt: Date;
  type: DeliveryType;
  orderNumber: string | null;
  responsibleUserId: string | null;
  notes: string | null;
  expectedItems: ExpectedItemData[];
}

/** What an edit may change: the supplier and the date are fixed (a new date is a reschedule). */
export type DeliveryEditData = Pick<DeliveryData, "type" | "orderNumber" | "responsibleUserId" | "notes" | "expectedItems">;

export const DELIVERY_SORT_FIELDS = ["scheduledAt", "supplier", "type", "status"] as const;
export type DeliverySortField = (typeof DELIVERY_SORT_FIELDS)[number];

export interface DeliveryFilters {
  supplierId?: string;
  type?: DeliveryType;
  status?: DeliveryStatus;
}

export interface DeliveryListQuery extends DeliveryFilters {
  /** Inclusive AR calendar-day range on the scheduled date. */
  from?: CalendarDate;
  to?: CalendarDate;
  /** Only open deliveries whose time has passed. */
  lateOnly?: boolean;
  /** Only deliveries still waiting to happen (SCHEDULED or CONFIRMED). */
  openOnly?: boolean;
  sort: DeliverySortField;
  dir: "asc" | "desc";
  page: number;
  pageSize: number;
  now: Date;
}

export interface CalendarQuery extends DeliveryFilters {
  /** First visible AR day and the day after the last one. */
  from: CalendarDate;
  toExclusive: CalendarDate;
}

export interface Page<T> {
  items: T[];
  total: number;
}

/** A delivery as a row of a list or a calendar cell (no expected items). */
export interface DeliverySummary {
  id: string;
  supplierId: string;
  supplierName: string;
  scheduledAt: Date;
  type: DeliveryType;
  status: DeliveryStatus;
  orderNumber: string | null;
  responsibleUserName: string | null;
  expectedItemCount: number;
}

export interface ComplianceQuery {
  supplierId?: string;
  from?: CalendarDate;
  to?: CalendarDate;
}

export interface SupplierOption {
  id: string;
  name: string;
  active: boolean;
}

export interface UserOption {
  id: string;
  name: string;
}

export interface DeliveryReadRepository {
  findById(id: string): Promise<DeliveryRecord | null>;
  list(query: DeliveryListQuery): Promise<Page<DeliverySummary>>;
  listForCalendar(query: CalendarQuery): Promise<DeliverySummary[]>;
  /** Open (scheduled or confirmed) deliveries of a supplier, soonest first: overdue ones come first. */
  listOpenForSupplier(supplierId: string, limit: number): Promise<DeliverySummary[]>;
  /** Deliveries (type DELIVERY) with the confirmation time of their latest confirmed receipt. */
  listComplianceRows(query: ComplianceQuery): Promise<ComplianceRow[]>;
  listSupplierOptions(): Promise<SupplierOption[]>;
  listUserOptions(): Promise<UserOption[]>;
  supplierNames(ids: readonly string[]): Promise<Map<string, string>>;
}

/** Operations inside one delivery transaction (rolled back if the work throws). */
export interface DeliveryTx {
  /** Locks the delivery row (`FOR UPDATE`) and returns it, so concurrent changes are serialized. */
  lock(id: string): Promise<DeliveryRecord | null>;
  setStatus(id: string, status: DeliveryStatus): Promise<void>;
  create(data: DeliveryData, rescheduledFromId?: string): Promise<DeliveryRecord>;
  update(id: string, data: DeliveryEditData): Promise<DeliveryRecord>;
  hasReceipts(id: string): Promise<boolean>;
  supplierStatus(id: string): Promise<"ACTIVE" | "INACTIVE" | null>;
  userIsActive(id: string): Promise<boolean>;
  /** Status of each product that exists. */
  productStatuses(ids: readonly string[]): Promise<Map<string, "ACTIVE" | "INACTIVE" | "ARCHIVED">>;
}

export interface DeliveryUnitOfWork {
  run<T>(work: (tx: DeliveryTx) => Promise<T>): Promise<T>;
}
