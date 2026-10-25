import { describe, expect, it } from "vitest";
import { effectiveLotStatus } from "./lot";
import { makeLot } from "./lot-fixtures";
import { planCountCorrection, provisionalDifference, summarizeCount } from "./stock-count";

const TODAY = "2026-10-25";

describe("provisionalDifference", () => {
  it("is counted minus expected, and null while uncounted", () => {
    expect(provisionalDifference(10, 8)).toBe(-2);
    expect(provisionalDifference(10, 13)).toBe(3);
    expect(provisionalDifference(10, 10)).toBe(0);
    expect(provisionalDifference(10, null)).toBeNull();
    expect(provisionalDifference(0, 0)).toBe(0);
  });
});

describe("summarizeCount", () => {
  it("counts lots, differences and units over/short", () => {
    const summary = summarizeCount([
      { expectedQuantity: 10, countedQuantity: 8 },
      { expectedQuantity: 5, countedQuantity: 9 },
      { expectedQuantity: 4, countedQuantity: 4 },
      { expectedQuantity: 7, countedQuantity: null },
    ]);
    expect(summary).toEqual({ total: 4, counted: 3, uncounted: 1, withDifference: 2, unitsOver: 4, unitsShort: 2 });
  });

  it("handles an empty count", () => {
    expect(summarizeCount([])).toEqual({ total: 0, counted: 0, uncounted: 0, withDifference: 0, unitsOver: 0, unitsShort: 0 });
  });
});

describe("planCountCorrection", () => {
  it("creates nothing when the counted quantity matches the lot", () => {
    expect(planCountCorrection(makeLot({ id: "a", currentQuantity: 10 }), 10, TODAY)).toEqual({ difference: 0, plan: null });
  });

  it("a shortage becomes a COUNT_CORRECTION_OUT of the missing units", () => {
    const { difference, plan } = planCountCorrection(makeLot({ id: "a", currentQuantity: 10 }), 7, TODAY);
    expect(difference).toBe(-3);
    expect(plan?.movements).toEqual([{ type: "COUNT_CORRECTION_OUT", lotId: "a", quantity: 3, balanceAfter: 7 }]);
    expect(plan?.updates[0]).toMatchObject({ currentQuantity: 7, status: "AVAILABLE" });
  });

  it("a surplus becomes a COUNT_CORRECTION_IN of the extra units", () => {
    const { difference, plan } = planCountCorrection(makeLot({ id: "a", currentQuantity: 10 }), 14, TODAY);
    expect(difference).toBe(4);
    expect(plan?.movements).toEqual([{ type: "COUNT_CORRECTION_IN", lotId: "a", quantity: 4, balanceAfter: 14 }]);
  });

  it("counting zero depletes the lot; finding stock in a depleted lot revives it", () => {
    expect(planCountCorrection(makeLot({ id: "a", currentQuantity: 5 }), 0, TODAY).plan?.updates[0].status).toBe("DEPLETED");
    const revived = planCountCorrection(makeLot({ id: "a", currentQuantity: 0, status: "DEPLETED" }), 2, TODAY);
    expect(revived.plan?.updates[0]).toMatchObject({ currentQuantity: 2, status: "AVAILABLE" });
  });

  it("clamps the blocked units when the count leaves fewer units than were blocked", () => {
    const { plan } = planCountCorrection(makeLot({ id: "a", currentQuantity: 10, blockedQuantity: 8 }), 5, TODAY);
    expect(plan?.updates[0]).toMatchObject({ currentQuantity: 5, blockedQuantity: 5 });
  });

  it("corrects expired lots too and they stay expired", () => {
    const expired = makeLot({ id: "old", expiryDate: "2026-10-01", currentQuantity: 6 });
    const { plan } = planCountCorrection(expired, 4, TODAY);
    expect(plan?.movements[0]).toMatchObject({ type: "COUNT_CORRECTION_OUT", quantity: 2, balanceAfter: 4 });
    const after = { ...expired, currentQuantity: 4, status: plan!.updates[0].status };
    expect(effectiveLotStatus(after, TODAY)).toBe("EXPIRED");
  });

  it("uses the CURRENT quantity, not the snapshot: movements during the count are not counted twice", () => {
    // Snapshot said 10, an exit of 3 happened meanwhile (lot now holds 7), the shelf really has 7.
    expect(planCountCorrection(makeLot({ id: "a", currentQuantity: 7 }), 7, TODAY).plan).toBeNull();
  });
});
