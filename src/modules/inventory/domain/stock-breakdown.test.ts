import { describe, expect, it } from "vitest";
import { makeLot } from "./lot-fixtures";
import { computeStockBreakdown } from "./stock-breakdown";

const TODAY = "2026-10-25";

describe("computeStockBreakdown", () => {
  it("is all zeros without lots", () => {
    expect(computeStockBreakdown([], TODAY)).toEqual({ physical: 0, blocked: 0, expired: 0, available: 0 });
  });

  it("everything is available for plain AVAILABLE lots", () => {
    const lots = [makeLot({ id: "a", currentQuantity: 10 }), makeLot({ id: "b", currentQuantity: 5 })];
    expect(computeStockBreakdown(lots, TODAY)).toEqual({ physical: 15, blocked: 0, expired: 0, available: 15 });
  });

  it("counts individually blocked units of non-expired lots as blocked", () => {
    const lots = [makeLot({ id: "a", currentQuantity: 10, blockedQuantity: 3 })];
    expect(computeStockBreakdown(lots, TODAY)).toEqual({ physical: 10, blocked: 3, expired: 0, available: 7 });
  });

  it("counts all units of QUARANTINE and BLOCKED lots as blocked", () => {
    const lots = [
      makeLot({ id: "a", currentQuantity: 6, status: "QUARANTINE" }),
      makeLot({ id: "b", currentQuantity: 4, status: "BLOCKED", blockedQuantity: 2 }),
      makeLot({ id: "c", currentQuantity: 5 }),
    ];
    // The 2 individually blocked units of lot b are not counted twice.
    expect(computeStockBreakdown(lots, TODAY)).toEqual({ physical: 15, blocked: 10, expired: 0, available: 5 });
  });

  it("counts units of expired lots as expired, whatever else is set on them", () => {
    const lots = [
      makeLot({ id: "a", currentQuantity: 8, expiryDate: "2026-10-24" }),
      makeLot({ id: "b", currentQuantity: 3, expiryDate: "2026-01-01", status: "QUARANTINE", blockedQuantity: 1 }),
      makeLot({ id: "c", currentQuantity: 10 }),
    ];
    expect(computeStockBreakdown(lots, TODAY)).toEqual({ physical: 21, blocked: 0, expired: 11, available: 10 });
  });

  it("a lot expiring today is still available", () => {
    const lots = [makeLot({ id: "a", currentQuantity: 4, expiryDate: TODAY })];
    expect(computeStockBreakdown(lots, TODAY)).toMatchObject({ expired: 0, available: 4 });
  });

  it("available never goes negative and buckets add up to physical", () => {
    const lots = [
      makeLot({ id: "a", currentQuantity: 5, blockedQuantity: 5 }),
      makeLot({ id: "b", currentQuantity: 7, status: "BLOCKED", blockedQuantity: 7 }),
      makeLot({ id: "c", currentQuantity: 9, expiryDate: "2020-01-01", blockedQuantity: 9 }),
    ];
    const result = computeStockBreakdown(lots, TODAY);
    expect(result.available).toBe(0);
    expect(result.blocked + result.expired + result.available).toBe(result.physical);
  });
});
