import { describe, expect, it } from "vitest";
import { movementInputSchema, parseExpiryInput } from "./movement-input";

const PRODUCT_ID = "7f6b1d2e-3c4a-4b5d-8e9f-0a1b2c3d4e5f";
const LOT_ID = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const REASON_ID = "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e";

function errorsOf(input: Record<string, string>) {
  const result = movementInputSchema.safeParse(input);
  if (result.success) return {};
  const errors: Record<string, string[]> = {};
  for (const issue of result.error.issues) (errors[String(issue.path[0])] ??= []).push(issue.message);
  return errors;
}

describe("expiry input", () => {
  it("accepts DD/MM/AAAA and MM/AAAA (last day of the month)", () => {
    expect(parseExpiryInput("15/03/2027")).toBe("2027-03-15");
    expect(parseExpiryInput("02/2028")).toBe("2028-02-29");
    expect(parseExpiryInput("12/2026")).toBe("2026-12-31");
  });

  it("rejects impossible or malformed dates", () => {
    expect(parseExpiryInput("31/02/2027")).toBeNull();
    expect(parseExpiryInput("13/2027")).toBeNull();
    expect(parseExpiryInput("2027-03-15")).toBeNull();
    expect(parseExpiryInput("hoy")).toBeNull();
  });
});

describe("movementInputSchema", () => {
  const entry = { type: "ENTRY", productId: PRODUCT_ID, quantity: "24", lotNumber: " L-001 ", expiryDate: "03/2027" };

  it("parses an entry, trimming and converting the expiry", () => {
    const parsed = movementInputSchema.parse({ ...entry, unitCost: "1250,5", supplierId: "", location: "Góndola 2" });
    expect(parsed).toMatchObject({
      type: "ENTRY",
      quantity: 24,
      lotNumber: "L-001",
      expiryDate: "2027-03-31",
      unitCost: "1250.50",
      supplierId: null,
      location: "Góndola 2",
    });
  });

  it("validates entry fields with Spanish messages", () => {
    const errors = errorsOf({ type: "ENTRY", productId: PRODUCT_ID, quantity: "0", lotNumber: "", expiryDate: "31/02/2027" });
    expect(errors.quantity?.[0]).toMatch(/cantidad entera/);
    expect(errors.lotNumber).toEqual(["Ingresá el número de lote."]);
    expect(errors.expiryDate).toEqual(["Ingresá la fecha como DD/MM/AAAA o MM/AAAA."]);
  });

  it("an exit needs only product and quantity; the lot is optional (FEFO by default)", () => {
    expect(movementInputSchema.parse({ type: "EXIT", productId: PRODUCT_ID, quantity: "3" })).toMatchObject({ quantity: 3, lotId: null });
    expect(movementInputSchema.parse({ type: "EXIT", productId: PRODUCT_ID, quantity: "3", lotId: LOT_ID })).toMatchObject({ lotId: LOT_ID });
  });

  it.each(["ADJUSTMENT_IN", "ADJUSTMENT_OUT", "RETURN", "WRITE_OFF"])("%s requires a lot and a reason", (type) => {
    expect(errorsOf({ type, productId: PRODUCT_ID, quantity: "2" }).lotId).toEqual(["Elegí un lote."]);
    expect(errorsOf({ type, productId: PRODUCT_ID, quantity: "2", lotId: LOT_ID }).reasonId).toEqual([
      "Elegí un motivo o escribí el detalle.",
    ]);
    expect(errorsOf({ type, productId: PRODUCT_ID, quantity: "2", lotId: LOT_ID, reasonId: REASON_ID })).toEqual({});
    expect(errorsOf({ type, productId: PRODUCT_ID, quantity: "2", lotId: LOT_ID, reasonText: "Se rompió" })).toEqual({});
  });

  it("block by units needs a quantity; whole-lot modes ignore it", () => {
    const base = { type: "BLOCK", productId: PRODUCT_ID, lotId: LOT_ID, reasonText: "Retiro del ANMAT" };
    expect(errorsOf({ ...base, mode: "UNITS" }).quantity).toBeDefined();
    expect(movementInputSchema.parse({ ...base, mode: "UNITS", quantity: "4" })).toMatchObject({ mode: "UNITS", quantity: 4 });
    expect(movementInputSchema.parse({ ...base, mode: "QUARANTINE" })).toMatchObject({ mode: "QUARANTINE", quantity: null });
    expect(errorsOf({ ...base, mode: "NOPE" }).mode).toEqual(["Elegí qué bloquear."]);
  });

  it("unblock accepts LOT or UNITS", () => {
    const base = { type: "UNBLOCK", productId: PRODUCT_ID, lotId: LOT_ID, reasonText: "Liberado" };
    expect(movementInputSchema.parse({ ...base, mode: "LOT" })).toMatchObject({ mode: "LOT" });
    expect(errorsOf({ ...base, mode: "UNITS" }).quantity).toBeDefined();
  });

  it("rejects an unknown type", () => {
    expect(movementInputSchema.safeParse({ type: "COUNT_CORRECTION", productId: PRODUCT_ID, quantity: "1" }).success).toBe(false);
  });
});
