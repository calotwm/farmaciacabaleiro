import type { CalendarDate } from "@/shared/domain/dates";
import type { DeliveryStatus, DeliveryType } from "@/modules/deliveries/domain/delivery-status";
import type { ManualIssue, ProposedIssue, ReceiptIssueType, ReceiptLine } from "../domain/receipt";

export type ReceiptStatus = "DRAFT" | "CONFIRMED";

export interface ReceiptLineRecord {
  id: string;
  productId: string;
  productCode: string;
  productName: string;
  barcode: string | null;
  unitName: string;
  lotNumber: string;
  expiryDate: CalendarDate;
  quantity: number;
  damagedQuantity: number;
  /** Decimal as a string with 2 decimals. */
  unitCost: string;
}

export interface ReceiptIssueRecord {
  id: string;
  type: ReceiptIssueType;
  productId: string | null;
  productName: string | null;
  quantity: number | null;
  description: string | null;
}

export interface ReceiptRecord {
  id: string;
  deliveryId: string | null;
  /** Scheduled instant and type of the linked delivery, when there is one. */
  deliveryScheduledAt: Date | null;
  deliveryType: DeliveryType | null;
  supplierId: string;
  supplierName: string;
  invoiceNumber: string | null;
  status: ReceiptStatus;
  isPartial: boolean;
  idempotencyKey: string;
  confirmedById: string | null;
  confirmedByName: string | null;
  confirmedAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  lines: ReceiptLineRecord[];
  issues: ReceiptIssueRecord[];
}

/** A receipt as a row of a list. */
export interface ReceiptSummary {
  id: string;
  deliveryId: string | null;
  supplierId: string;
  supplierName: string;
  invoiceNumber: string | null;
  status: ReceiptStatus;
  isPartial: boolean;
  createdAt: Date;
  confirmedAt: Date | null;
  lineCount: number;
  issueCount: number;
}

export const RECEIPT_STATUS_FILTERS = ["", "DRAFT", "CONFIRMED"] as const;
export type ReceiptStatusFilter = (typeof RECEIPT_STATUS_FILTERS)[number];

export interface ReceiptListQuery {
  supplierId?: string;
  status: ReceiptStatusFilter;
  /** Inclusive AR calendar-day range on the confirmation date (creation date for drafts). */
  from?: CalendarDate;
  to?: CalendarDate;
  withIssues?: boolean;
  dir: "asc" | "desc";
  page: number;
  pageSize: number;
}

export interface Page<T> {
  items: T[];
  total: number;
}

/** An expected product of the linked delivery with what is still pending after earlier receipts. */
export interface ExpectedProductView {
  productId: string;
  productCode: string;
  productName: string;
  barcode: string | null;
  unitName: string;
  expected: number;
  alreadyReceived: number;
  pending: number;
}

export interface ReceiptMovementView {
  id: string;
  type: string;
  productId: string;
  productName: string;
  lotNumber: string;
  quantity: number;
  balanceAfter: number;
  occurredAt: Date;
}

export interface SupplierOption {
  id: string;
  name: string;
}

export interface ReceivingReadRepository {
  findById(id: string): Promise<ReceiptRecord | null>;
  list(query: ReceiptListQuery): Promise<Page<ReceiptSummary>>;
  /** Expected products of a delivery with the pending quantities (confirmed receipts other than `excludeReceiptId`). */
  expectedProducts(deliveryId: string, excludeReceiptId?: string): Promise<ExpectedProductView[]>;
  listMovements(receiptId: string): Promise<ReceiptMovementView[]>;
  listForDelivery(deliveryId: string): Promise<ReceiptSummary[]>;
  listRecentForSupplier(supplierId: string, limit: number): Promise<ReceiptSummary[]>;
  listSupplierOptions(): Promise<SupplierOption[]>;
}

export interface DeliveryForReceiving {
  id: string;
  supplierId: string;
  type: DeliveryType;
  status: DeliveryStatus;
}

export interface ReceiptContent {
  invoiceNumber: string | null;
  notes: string | null;
  isPartial: boolean;
  lines: ReceiptLine[];
  manualIssues: ManualIssue[];
}

export interface StockEntryRequest {
  actorId: string;
  productId: string;
  lotNumber: string;
  expiryDate: CalendarDate;
  quantity: number;
  unitCost: string;
  supplierId: string;
  invoiceNumber: string | null;
  receiptId: string;
  receiptLineId: string;
  at: Date;
  today: CalendarDate;
}

export interface StockEntryResult {
  lotId: string;
  lotCreated: boolean;
  movementIds: string[];
}

/** Operations inside one receiving transaction (rolled back if the work throws). */
export interface ReceivingTx {
  /** Locks the receipt row (`FOR UPDATE`): a second confirm waits here and then sees the first one's result. */
  lockReceipt(id: string): Promise<ReceiptRecord | null>;
  /** Locks the delivery row (`FOR UPDATE`), the same lock the deliveries module takes for its own changes. */
  lockDelivery(id: string): Promise<DeliveryForReceiving | null>;
  findOpenDraftForDelivery(deliveryId: string): Promise<string | null>;
  createDraft(data: { supplierId: string; deliveryId: string | null; idempotencyKey: string }): Promise<string>;
  /** Replaces the lines and the manual issues of a draft; returns the stored lines with their ids. */
  replaceContent(receiptId: string, content: ReceiptContent): Promise<ReceiptLineRecord[]>;
  deliveryExpected(deliveryId: string): Promise<Array<{ productId: string; expectedQuantity: number }>>;
  /** Units (good + damaged) per product of the delivery's confirmed receipts, leaving `excludeReceiptId` out. */
  receivedSoFar(deliveryId: string, excludeReceiptId: string): Promise<Map<string, number>>;
  setDeliveryStatus(id: string, status: DeliveryStatus): Promise<void>;
  supplierStatus(id: string): Promise<"ACTIVE" | "INACTIVE" | null>;
  productStatuses(ids: readonly string[]): Promise<Map<string, "ACTIVE" | "INACTIVE" | "ARCHIVED">>;
  /** Adds units to stock through the inventory module (its rules: new lots cannot be expired, archived products are refused...). */
  enterStock(request: StockEntryRequest): Promise<StockEntryResult>;
  /** Marks the receipt CONFIRMED and stores its final issues (the manual ones plus the proposed ones). */
  markConfirmed(
    receiptId: string,
    data: { confirmedById: string; confirmedAt: Date; isPartial: boolean; issues: Array<ManualIssue | ProposedIssue> },
  ): Promise<void>;
  deleteDraft(receiptId: string): Promise<void>;
}

export interface ReceivingUnitOfWork {
  run<T>(work: (tx: ReceivingTx) => Promise<T>): Promise<T>;
}

/** After-commit notification of a receipt with issues. Idempotent per receipt and day; failures never undo the receipt. */
export interface ReceiptAlerts {
  publishIssues(receipt: { id: string; supplierName: string; issueCount: number }, today: CalendarDate): Promise<void>;
}
