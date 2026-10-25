import { describe, expect, it } from "vitest";
import { isDomainError } from "@/shared/domain/errors";
import {
  type RawReceiptLine,
  type ReceiptLine,
  assertConfirmable,
  compareWithExpected,
  goodQuantity,
  nextDeliveryStatus,
  normalizeReceiptLines,
  parseExpiry,
  proposeIssues,
  remainingExpected,
} from "./receipt";

const A = "product-a";
const B = "product-b";
const C = "product-c";

const raw = (overrides: Partial<RawReceiptLine> = {}): RawReceiptLine => ({
  productId: A,
  lotNumber: "L1",
  expiry: "01/01/2033",
  quantity: "10",
  damagedQuantity: "",
  unitCost: "",
  ...overrides,
});

const line = (productId: string, quantity: number, damagedQuantity = 0): ReceiptLine => ({
  productId,
  lotNumber: "L",
  expiryDate: "2033-01-01",
  quantity,
  damagedQuantity,
  unitCost: "0.00",
});

describe("normalizeReceiptLines", () => {
  it("parses a valid line: lot trimmed, expiry date, quantities and money", () => {
    const { lines, errors } = normalizeReceiptLines([raw({ lotNumber: "  L-9 ", expiry: "03/2033", quantity: "12", damagedQuantity: "2", unitCost: "1250,5" })]);
    expect(errors).toEqual([]);
    expect(lines).toEqual([{ productId: A, lotNumber: "L-9", expiryDate: "2033-03-31", quantity: 12, damagedQuantity: 2, unitCost: "1250.50" }]);
  });

  it("accepts DD/MM/AAAA and treats MM/AAAA as the last day of the month", () => {
    expect(parseExpiry("15/06/2030")).toBe("2030-06-15");
    expect(parseExpiry("02/2028")).toBe("2028-02-29");
    expect(parseExpiry("31/02/2030")).toBeNull();
    expect(parseExpiry("2030")).toBeNull();
  });

  it("names the line and every problem: zero quantity, damaged over received, bad expiry, missing lot or product", () => {
    const { lines, errors } = normalizeReceiptLines([
      raw(),
      raw({ quantity: "0" }),
      raw({ quantity: "5", damagedQuantity: "6" }),
      raw({ expiry: "mañana" }),
      raw({ lotNumber: " ", productId: "" }),
      raw({ quantity: "1.5" }),
      raw({ unitCost: "abc" }),
    ]);
    expect(lines).toHaveLength(1);
    expect(errors).toEqual([
      "Línea 2: la cantidad recibida debe ser un entero entre 1 y 1.000.000.",
      "Línea 3: las unidades dañadas no pueden superar la cantidad recibida.",
      "Línea 4: el vencimiento debe ser DD/MM/AAAA o MM/AAAA.",
      "Línea 5: falta el producto; ingresá el número de lote.",
      "Línea 6: la cantidad recibida debe ser un entero entre 1 y 1.000.000.",
      "Línea 7: el costo unitario no es válido (por ejemplo 1250,50).",
    ]);
  });

  it("rejects a quantity above the limit and a blank damaged field is zero", () => {
    expect(normalizeReceiptLines([raw({ quantity: "1000001" })]).errors).toHaveLength(1);
    expect(normalizeReceiptLines([raw({ quantity: "1000000", damagedQuantity: " " })]).lines[0]).toMatchObject({ quantity: 1_000_000, damagedQuantity: 0 });
  });
});

describe("comparison with the expected products", () => {
  it("matches exactly: no difference, no issues", () => {
    const comparison = compareWithExpected([{ productId: A, expectedQuantity: 10 }], [line(A, 6), line(A, 4)]);
    expect(comparison).toEqual([{ productId: A, expected: 10, received: 10, good: 10, damaged: 0, difference: 0 }]);
    expect(proposeIssues(comparison, { isPartial: false })).toEqual([]);
  });

  it("proposes SHORTAGE for missing units and for expected products that did not arrive", () => {
    const comparison = compareWithExpected(
      [
        { productId: A, expectedQuantity: 10 },
        { productId: B, expectedQuantity: 3 },
      ],
      [line(A, 7)],
    );
    expect(comparison.map((item) => [item.productId, item.received, item.difference])).toEqual([
      [A, 7, -3],
      [B, 0, -3],
    ]);
    expect(proposeIssues(comparison, { isPartial: false })).toEqual([
      { type: "SHORTAGE", productId: A, quantity: 3 },
      { type: "SHORTAGE", productId: B, quantity: 3 },
    ]);
  });

  it("proposes EXCESS for more than expected and for a product nobody expected", () => {
    const comparison = compareWithExpected([{ productId: A, expectedQuantity: 5 }], [line(A, 8), line(C, 2)]);
    expect(proposeIssues(comparison, { isPartial: false })).toEqual([
      { type: "EXCESS", productId: A, quantity: 3 },
      { type: "EXCESS", productId: C, quantity: 2 },
    ]);
  });

  it("proposes DAMAGED for damaged units; received counts good plus damaged", () => {
    const comparison = compareWithExpected([{ productId: A, expectedQuantity: 10 }], [line(A, 10, 4)]);
    expect(comparison[0]).toMatchObject({ received: 10, good: 6, damaged: 4, difference: 0 });
    expect(proposeIssues(comparison, { isPartial: false })).toEqual([{ type: "DAMAGED", productId: A, quantity: 4 }]);
  });

  it("combines SHORTAGE and DAMAGED for the same product", () => {
    const comparison = compareWithExpected([{ productId: A, expectedQuantity: 10 }], [line(A, 6, 2)]);
    expect(proposeIssues(comparison, { isPartial: false })).toEqual([
      { type: "SHORTAGE", productId: A, quantity: 4 },
      { type: "DAMAGED", productId: A, quantity: 2 },
    ]);
  });

  it("a partial receipt proposes no shortage (the rest is still expected) but still flags excess and damage", () => {
    const comparison = compareWithExpected(
      [
        { productId: A, expectedQuantity: 10 },
        { productId: B, expectedQuantity: 4 },
      ],
      [line(A, 6, 1), line(B, 5)],
    );
    expect(proposeIssues(comparison, { isPartial: true })).toEqual([
      { type: "DAMAGED", productId: A, quantity: 1 },
      { type: "EXCESS", productId: B, quantity: 1 },
    ]);
  });

  it("without expected items nothing is compared: only damage can be proposed", () => {
    const comparison = compareWithExpected([], [line(A, 5, 1), line(B, 2)]);
    expect(comparison.every((item) => item.expected === null && item.difference === null)).toBe(true);
    expect(proposeIssues(comparison, { isPartial: false })).toEqual([{ type: "DAMAGED", productId: A, quantity: 1 }]);
  });

  it("sums the lines of the same product (several lots)", () => {
    const comparison = compareWithExpected([{ productId: A, expectedQuantity: 9 }], [line(A, 3), line(A, 4, 1), line(A, 2)]);
    expect(comparison).toEqual([{ productId: A, expected: 9, received: 9, good: 8, damaged: 1, difference: 0 }]);
  });

  it("goodQuantity subtracts the damaged units", () => {
    expect(goodQuantity(line(A, 10, 3))).toBe(7);
    expect(goodQuantity(line(A, 4, 4))).toBe(0);
  });
});

describe("partial deliveries", () => {
  it("expects only what earlier receipts did not bring", () => {
    const pending = remainingExpected(
      [
        { productId: A, expectedQuantity: 10 },
        { productId: B, expectedQuantity: 4 },
      ],
      new Map([
        [A, 6],
        [B, 9],
      ]),
    );
    expect(pending).toEqual([{ productId: A, expectedQuantity: 4 }]);
  });

  it("a complete receipt closes the delivery; a partial one keeps it open", () => {
    expect(nextDeliveryStatus("SCHEDULED", false)).toBe("RECEIVED");
    expect(nextDeliveryStatus("CONFIRMED", false)).toBe("RECEIVED");
    expect(nextDeliveryStatus("SCHEDULED", true)).toBe("CONFIRMED");
    expect(nextDeliveryStatus("CONFIRMED", true)).toBeNull();
  });
});

describe("assertConfirmable", () => {
  it("requires at least one line and rejects already expired lots, naming the line", () => {
    const failure = (lines: ReceiptLine[]) => {
      try {
        assertConfirmable(lines, "2026-11-10");
      } catch (error) {
        return isDomainError(error) ? (error as unknown as { fieldErrors: Record<string, string[]> }).fieldErrors : undefined;
      }
    };
    expect(failure([])).toEqual({ lines: ["Agregá al menos un producto recibido."] });
    expect(failure([{ ...line(A, 1), expiryDate: "2026-11-09" }, line(B, 1)])).toEqual({
      lines: ["Línea 1: la fecha de vencimiento ya pasó: no se puede ingresar un lote vencido."],
    });
    expect(failure([line(A, 1)])).toBeUndefined();
  });

  it("a lot that expires today is still valid (it expires at the end of the day)", () => {
    expect(() => assertConfirmable([{ ...line(A, 1), expiryDate: "2026-11-10" }], "2026-11-10")).not.toThrow();
  });
});
