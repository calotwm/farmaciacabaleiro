import { describe, expect, it } from "vitest";
import { cancelDeliverySchema, createDeliverySchema, editDeliverySchema, rescheduleDeliverySchema } from "./delivery-input";

const SUPPLIER = "0b8e1f3a-5c7d-4e9a-8b2c-1d3e5f7a9b0c";
const PRODUCT_A = "1c9f2a4b-6d8e-4fab-9c3d-2e4f6a8b0c1d";
const PRODUCT_B = "2dafa3bc-7e9f-40bc-8d4e-3f5a7b9c1d2e";

const base = { supplierId: SUPPLIER, date: "2026-11-10", time: "09:30", type: "DELIVERY" };

describe("delivery input schemas", () => {
  it("combines date and time into the AR instant", () => {
    const result = createDeliverySchema.safeParse(base);
    expect(result.success && result.data.scheduledAt.toISOString()).toBe("2026-11-10T12:30:00.000Z");
    expect(result.success && result.data).toMatchObject({ supplierId: SUPPLIER, type: "DELIVERY", orderNumber: null, responsibleUserId: null, notes: null, expectedItems: [] });
  });

  it("keeps the AR midnight edge: 00:00 AR is 03:00Z, 23:59 AR is 02:59Z of the next UTC day", () => {
    const midnight = createDeliverySchema.safeParse({ ...base, time: "00:00" });
    expect(midnight.success && midnight.data.scheduledAt.toISOString()).toBe("2026-11-10T03:00:00.000Z");
    const late = createDeliverySchema.safeParse({ ...base, time: "23:59" });
    expect(late.success && late.data.scheduledAt.toISOString()).toBe("2026-11-11T02:59:00.000Z");
  });

  it("rejects an impossible date, a bad time, a missing supplier or an unknown type", () => {
    const fields = (input: Record<string, unknown>) => {
      const result = createDeliverySchema.safeParse({ ...base, ...input });
      return result.success ? [] : result.error.issues.map((issue) => String(issue.path[0]));
    };
    expect(fields({ date: "2026-02-30" })).toEqual(["date"]);
    expect(fields({ time: "9:30" })).toEqual(["time"]);
    expect(fields({ supplierId: "" })).toEqual(["supplierId"]);
    expect(fields({ type: "PICKUP" })).toEqual(["type"]);
  });

  it("parses expected items and rejects duplicates, bad quantities and malformed JSON", () => {
    const ok = createDeliverySchema.safeParse({ ...base, items: JSON.stringify([{ productId: PRODUCT_A, quantity: 12 }, { productId: PRODUCT_B, quantity: 1 }]) });
    expect(ok.success && ok.data.expectedItems).toEqual([
      { productId: PRODUCT_A, expectedQuantity: 12 },
      { productId: PRODUCT_B, expectedQuantity: 1 },
    ]);
    const bad = (items: string) => createDeliverySchema.safeParse({ ...base, items }).success;
    expect(bad(JSON.stringify([{ productId: PRODUCT_A, quantity: 1 }, { productId: PRODUCT_A, quantity: 2 }]))).toBe(false);
    expect(bad(JSON.stringify([{ productId: PRODUCT_A, quantity: 0 }]))).toBe(false);
    expect(bad(JSON.stringify([{ productId: PRODUCT_A, quantity: 1.5 }]))).toBe(false);
    expect(bad(JSON.stringify([{ productId: "x", quantity: 1 }]))).toBe(false);
    expect(bad("{not json")).toBe(false);
    expect(bad("")).toBe(true);
  });

  it("edit does not take supplier or date; reschedule takes a new date and an optional reason", () => {
    const edit = editDeliverySchema.safeParse({ type: "SALES_VISIT", orderNumber: " P-1 ", notes: "x" });
    expect(edit.success && edit.data).toEqual({ type: "SALES_VISIT", orderNumber: "P-1", responsibleUserId: null, notes: "x", expectedItems: [] });

    const reschedule = rescheduleDeliverySchema.safeParse({ date: "2026-11-12", time: "15:00", reason: "Falta de stock" });
    expect(reschedule.success && reschedule.data.scheduledAt.toISOString()).toBe("2026-11-12T18:00:00.000Z");
    expect(rescheduleDeliverySchema.safeParse({ date: "", time: "15:00" }).success).toBe(false);
    expect(cancelDeliverySchema.safeParse({}).success).toBe(true);
  });
});
