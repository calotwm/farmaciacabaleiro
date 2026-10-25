import { type CalendarDate, expiryFromMonthYear, parseDisplayDate } from "@/shared/domain/dates";
import { ValidationError } from "@/shared/domain/errors";
import type { DeliveryStatus } from "@/modules/deliveries/domain/delivery-status";

/**
 * Pure receiving rules: line validation, the comparison against what was expected, the issues that
 * follow from it and the status the delivery ends in. No I/O: the service applies them inside one transaction.
 */

export const MAX_RECEIPT_QUANTITY = 1_000_000;
export const MAX_LOT_NUMBER_LENGTH = 60;
export const MAX_ISSUE_DESCRIPTION_LENGTH = 500;

export const RECEIPT_ISSUE_TYPES = ["SHORTAGE", "EXCESS", "DAMAGED", "WRONG_PRODUCT", "OTHER"] as const;
export type ReceiptIssueType = (typeof RECEIPT_ISSUE_TYPES)[number];

/** Types a person can add by hand; the others are proposed from the comparison. */
export const MANUAL_ISSUE_TYPES = ["WRONG_PRODUCT", "OTHER"] as const;
export type ManualIssueType = (typeof MANUAL_ISSUE_TYPES)[number];

export const ISSUE_TYPE_LABELS: Record<ReceiptIssueType, string> = {
  SHORTAGE: "Faltante",
  EXCESS: "Excedente",
  DAMAGED: "Dañado",
  WRONG_PRODUCT: "Producto equivocado",
  OTHER: "Otro",
};

/** One received lot of a product, as typed by the user (strings) before validation. */
export interface RawReceiptLine {
  productId: string;
  lotNumber: string;
  /** DD/MM/AAAA or MM/AAAA. */
  expiry: string;
  quantity: string;
  damagedQuantity: string;
  /** Decimal with comma or dot; empty means unknown (stored as 0.00). */
  unitCost: string;
}

/** A validated line. `quantity` counts every unit that arrived, damaged ones included. */
export interface ReceiptLine {
  productId: string;
  lotNumber: string;
  expiryDate: CalendarDate;
  quantity: number;
  damagedQuantity: number;
  unitCost: string;
}

export interface ManualIssue {
  type: ManualIssueType;
  productId: string | null;
  quantity: number | null;
  description: string;
}

export interface ProposedIssue {
  type: "SHORTAGE" | "EXCESS" | "DAMAGED";
  productId: string;
  quantity: number;
}

/** Units that go into stock: what arrived minus what arrived damaged. */
export function goodQuantity(line: Pick<ReceiptLine, "quantity" | "damagedQuantity">): number {
  return line.quantity - line.damagedQuantity;
}

/** DD/MM/AAAA (exact day) or MM/AAAA (last day of the month). */
export function parseExpiry(raw: string): CalendarDate | null {
  return parseDisplayDate(raw) ?? expiryFromMonthYear(raw);
}

const INTEGER = /^\d{1,9}$/;
const MONEY = /^\d{1,10}([.,]\d{1,2})?$/;

function normalizeMoney(value: string): string {
  const [integer, decimals = ""] = value.replace(",", ".").split(".");
  return `${integer}.${decimals.padEnd(2, "0")}`;
}

const lineLabel = (index: number) => `Línea ${index + 1}`;

/**
 * Parses and checks the lines of a receipt (shape only: state-dependent rules such as "already expired" live in
 * `assertConfirmable`). Returns the clean lines plus one Spanish message per problem, each naming its line.
 */
export function normalizeReceiptLines(rawLines: readonly RawReceiptLine[]): { lines: ReceiptLine[]; errors: string[] } {
  const lines: ReceiptLine[] = [];
  const errors: string[] = [];
  rawLines.forEach((raw, index) => {
    const label = lineLabel(index);
    const problems: string[] = [];
    const lotNumber = raw.lotNumber.trim();
    if (!raw.productId.trim()) problems.push("falta el producto");
    if (!lotNumber) problems.push("ingresá el número de lote");
    else if (lotNumber.length > MAX_LOT_NUMBER_LENGTH) problems.push("el número de lote es demasiado largo");
    const expiryDate = parseExpiry(raw.expiry.trim());
    if (!raw.expiry.trim()) problems.push("ingresá el vencimiento");
    else if (!expiryDate) problems.push("el vencimiento debe ser DD/MM/AAAA o MM/AAAA");

    const quantityText = raw.quantity.trim();
    const quantity = INTEGER.test(quantityText) ? Number(quantityText) : Number.NaN;
    if (!(quantity >= 1 && quantity <= MAX_RECEIPT_QUANTITY)) {
      problems.push(`la cantidad recibida debe ser un entero entre 1 y ${MAX_RECEIPT_QUANTITY.toLocaleString("es-AR")}`);
    }
    const damagedText = raw.damagedQuantity.trim();
    const damagedQuantity = damagedText === "" ? 0 : INTEGER.test(damagedText) ? Number(damagedText) : Number.NaN;
    if (Number.isNaN(damagedQuantity)) problems.push("las unidades dañadas deben ser un entero");
    else if (quantity >= 1 && damagedQuantity > quantity) problems.push("las unidades dañadas no pueden superar la cantidad recibida");
    const costText = raw.unitCost.trim();
    if (costText !== "" && !MONEY.test(costText)) problems.push("el costo unitario no es válido (por ejemplo 1250,50)");

    if (problems.length > 0) {
      errors.push(`${label}: ${problems.join("; ")}.`);
      return;
    }
    lines.push({
      productId: raw.productId.trim(),
      lotNumber,
      expiryDate: expiryDate as CalendarDate,
      quantity,
      damagedQuantity,
      unitCost: costText === "" ? "0.00" : normalizeMoney(costText),
    });
  });
  return { lines, errors };
}

/** What is still pending of an order after earlier confirmed receipts: expected minus received so far, never negative. */
export function remainingExpected(
  expected: ReadonlyArray<{ productId: string; expectedQuantity: number }>,
  alreadyReceived: ReadonlyMap<string, number>,
): Array<{ productId: string; expectedQuantity: number }> {
  return expected
    .map((item) => ({ productId: item.productId, expectedQuantity: Math.max(0, item.expectedQuantity - (alreadyReceived.get(item.productId) ?? 0)) }))
    .filter((item) => item.expectedQuantity > 0);
}

export interface ProductComparison {
  productId: string;
  /** Null when there is nothing to compare with (a receipt without expected items). */
  expected: number | null;
  /** Everything that arrived: good plus damaged. */
  received: number;
  good: number;
  damaged: number;
  /** received - expected (negative = short). Null without an expectation. */
  difference: number | null;
}

/**
 * Expected versus received per product (`received` = good + damaged). Expected products that did not
 * arrive appear with 0; received products nobody expected appear with expected 0 when an order exists.
 */
export function compareWithExpected(
  expected: ReadonlyArray<{ productId: string; expectedQuantity: number }>,
  lines: ReadonlyArray<Pick<ReceiptLine, "productId" | "quantity" | "damagedQuantity">>,
): ProductComparison[] {
  const hasExpected = expected.length > 0;
  const order: string[] = [];
  const totals = new Map<string, { received: number; damaged: number }>();
  const expectedBy = new Map<string, number>();
  for (const item of expected) {
    if (!expectedBy.has(item.productId)) order.push(item.productId);
    expectedBy.set(item.productId, (expectedBy.get(item.productId) ?? 0) + item.expectedQuantity);
  }
  for (const line of lines) {
    if (!expectedBy.has(line.productId) && !totals.has(line.productId)) order.push(line.productId);
    const current = totals.get(line.productId) ?? { received: 0, damaged: 0 };
    totals.set(line.productId, { received: current.received + line.quantity, damaged: current.damaged + line.damagedQuantity });
  }
  return order.map((productId) => {
    const { received, damaged } = totals.get(productId) ?? { received: 0, damaged: 0 };
    const expectedQuantity = hasExpected ? (expectedBy.get(productId) ?? 0) : null;
    return {
      productId,
      expected: expectedQuantity,
      received,
      good: received - damaged,
      damaged,
      difference: expectedQuantity === null ? null : received - expectedQuantity,
    };
  });
}

/**
 * Issues proposed by the comparison: SHORTAGE (received < expected), EXCESS (received > expected, including
 * a product nobody expected) and DAMAGED. A partial receipt expects the rest later, so it proposes no shortage.
 */
export function proposeIssues(comparisons: readonly ProductComparison[], options: { isPartial: boolean }): ProposedIssue[] {
  const issues: ProposedIssue[] = [];
  for (const item of comparisons) {
    if (item.difference !== null && item.difference < 0 && !options.isPartial) {
      issues.push({ type: "SHORTAGE", productId: item.productId, quantity: -item.difference });
    }
    if (item.difference !== null && item.difference > 0) issues.push({ type: "EXCESS", productId: item.productId, quantity: item.difference });
    if (item.damaged > 0) issues.push({ type: "DAMAGED", productId: item.productId, quantity: item.damaged });
  }
  return issues;
}

/**
 * Status of the linked delivery after a confirmed receipt: a complete receipt closes it (RECEIVED); a partial one
 * keeps it open (CONFIRMED) for the remainder, or leaves it as it is when it already is CONFIRMED (null = no change).
 */
export function nextDeliveryStatus(current: DeliveryStatus, isPartial: boolean): DeliveryStatus | null {
  if (!isPartial) return "RECEIVED";
  return current === "SCHEDULED" ? "CONFIRMED" : null;
}

/** The rules that depend on the day and on the receipt being final. Throws a ValidationError naming every problem. */
export function assertConfirmable(lines: readonly ReceiptLine[], today: CalendarDate): void {
  const errors: string[] = [];
  if (lines.length === 0) errors.push("Agregá al menos un producto recibido.");
  lines.forEach((line, index) => {
    if (line.expiryDate < today) {
      errors.push(`${lineLabel(index)}: la fecha de vencimiento ya pasó: no se puede ingresar un lote vencido.`);
    }
    if (line.quantity < 1) errors.push(`${lineLabel(index)}: la cantidad recibida debe ser mayor que cero.`);
  });
  if (errors.length > 0) throw new ValidationError("Receipt cannot be confirmed", { lines: errors });
}
