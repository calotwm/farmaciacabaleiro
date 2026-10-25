import { describe, expect, it } from "vitest";
import { receiptContentSchema, startReceiptSchema } from "./receipt-input";

const PRODUCT = "1c9f2a4b-6d8e-4fab-9c3d-2e4f6a8b0c1d";
const rawLine = { productId: PRODUCT, lotNumber: "L1", expiry: "03/2033", quantity: "10", damagedQuantity: "2", unitCost: "1250,5" };

describe("receipt content schema", () => {
  it("parses the editor submission into typed content", () => {
    const result = receiptContentSchema.safeParse({
      invoiceNumber: " R-1 ",
      isPartial: "on",
      lines: JSON.stringify([rawLine]),
      issues: JSON.stringify([{ type: "OTHER", productId: "", quantity: "", description: " Caja rota " }]),
    });
    expect(result.success && result.data).toEqual({
      invoiceNumber: "R-1",
      notes: null,
      isPartial: true,
      lines: [{ productId: PRODUCT, lotNumber: "L1", expiryDate: "2033-03-31", quantity: 10, damagedQuantity: 2, unitCost: "1250.50" }],
      manualIssues: [{ type: "OTHER", productId: null, quantity: null, description: "Caja rota" }],
    });
  });

  it("accepts an empty draft and treats a missing partial flag as false", () => {
    const result = receiptContentSchema.safeParse({});
    expect(result.success && result.data).toMatchObject({ lines: [], manualIssues: [], isPartial: false });
  });

  it("reports line and issue problems under their field, naming the line", () => {
    const result = receiptContentSchema.safeParse({
      lines: JSON.stringify([rawLine, { ...rawLine, quantity: "0" }]),
      issues: JSON.stringify([{ type: "SHORTAGE", description: "" }]),
    });
    expect(result.success).toBe(false);
    const issues = !result.success ? result.error.issues : [];
    expect(issues.find((issue) => issue.path[0] === "lines")?.message).toMatch(/^Línea 2: /);
    expect(issues.find((issue) => issue.path[0] === "issues")?.message).toMatch(/^Problema 1: /);
  });

  it("rejects malformed JSON", () => {
    expect(receiptContentSchema.safeParse({ lines: "{no" }).success).toBe(false);
  });
});

describe("start receipt schema", () => {
  it("needs a delivery or a supplier", () => {
    expect(startReceiptSchema.safeParse({ deliveryId: PRODUCT, supplierId: "" }).success).toBe(true);
    expect(startReceiptSchema.safeParse({ deliveryId: "", supplierId: PRODUCT }).success).toBe(true);
    expect(startReceiptSchema.safeParse({ deliveryId: "", supplierId: "" }).success).toBe(false);
    expect(startReceiptSchema.safeParse({ supplierId: "nope" }).success).toBe(false);
  });
});
