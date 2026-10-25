import { describe, expect, it } from "vitest";
import { ExpiredLotError, InsufficientStockError, LotNotUsableError } from "./errors";
import { makeLot, userTextOf } from "./lot-fixtures";
import {
  MAX_MOVEMENT_QUANTITY,
  assertNewLotExpiry,
  assertValidQuantity,
  planAddition,
  planBlock,
  planExit,
  planRemoval,
  planUnblock,
  statusAfter,
} from "./movement-rules";
import { allowedOnExpiredLot, requiresReason, reasonKindFor, stockDirection } from "./movement-type";

const TODAY = "2026-10-25";
const expired = (overrides = {}) => makeLot({ id: "old", expiryDate: "2026-10-24", currentQuantity: 6, ...overrides });

describe("quantity validation", () => {
  it("accepts positive integers up to the cap", () => {
    expect(() => assertValidQuantity(1)).not.toThrow();
    expect(() => assertValidQuantity(MAX_MOVEMENT_QUANTITY)).not.toThrow();
  });

  it.each([0, -1, 1.5, Number.NaN, MAX_MOVEMENT_QUANTITY + 1])("rejects %s", (quantity) => {
    expect(userTextOf(() => assertValidQuantity(quantity))).toMatch(/cantidad entera entre 1 y/);
  });
});

describe("statusAfter", () => {
  it("reaching zero depletes the lot, receiving stock revives a depleted one", () => {
    expect(statusAfter("AVAILABLE", 0)).toBe("DEPLETED");
    expect(statusAfter("QUARANTINE", 0)).toBe("DEPLETED");
    expect(statusAfter("DEPLETED", 3)).toBe("AVAILABLE");
    expect(statusAfter("QUARANTINE", 3)).toBe("QUARANTINE");
    expect(statusAfter("AVAILABLE", 3)).toBe("AVAILABLE");
  });
});

describe("EXIT", () => {
  it("allocates FEFO across lots and writes one movement per lot with its balance", () => {
    const lots = [
      makeLot({ id: "late", expiryDate: "2028-01-01", currentQuantity: 10 }),
      makeLot({ id: "early", expiryDate: "2027-01-01", currentQuantity: 3 }),
    ];
    const plan = planExit(lots, 5, TODAY);
    expect(plan.movements).toEqual([
      { type: "EXIT", lotId: "early", quantity: 3, balanceAfter: 0 },
      { type: "EXIT", lotId: "late", quantity: 2, balanceAfter: 8 },
    ]);
    expect(plan.updates).toEqual([
      { lotId: "early", currentQuantity: 0, blockedQuantity: 0, status: "DEPLETED" },
      { lotId: "late", currentQuantity: 8, blockedQuantity: 0, status: "AVAILABLE" },
    ]);
  });

  it("skips expired, quarantined and blocked lots and never uses blocked units", () => {
    const lots = [
      expired({ currentQuantity: 50 }),
      makeLot({ id: "q", status: "QUARANTINE", currentQuantity: 50, expiryDate: "2026-11-01" }),
      makeLot({ id: "ok", currentQuantity: 10, blockedQuantity: 8 }),
    ];
    expect(planExit(lots, 2, TODAY).movements).toEqual([{ type: "EXIT", lotId: "ok", quantity: 2, balanceAfter: 8 }]);
    expect(() => planExit(lots, 3, TODAY)).toThrow(InsufficientStockError);
  });

  it("rejects when only an expired lot has stock, stating 0 available", () => {
    expect(userTextOf(() => planExit([expired()], 1, TODAY))).toMatch(/hay 0 unidades/);
  });

  it("rejects more than the available total (no negative stock)", () => {
    const lots = [makeLot({ id: "a", currentQuantity: 4 }), makeLot({ id: "b", currentQuantity: 3, expiryDate: "2031-01-01" })];
    expect(() => planExit(lots, 8, TODAY)).toThrow(InsufficientStockError);
    expect(planExit(lots, 7, TODAY).updates.every((u) => u.currentQuantity === 0)).toBe(true);
  });

  it("can take from a specific usable lot instead of FEFO", () => {
    const lots = [makeLot({ id: "early", expiryDate: "2027-01-01" }), makeLot({ id: "late", expiryDate: "2028-01-01" })];
    expect(planExit(lots, 4, TODAY, "late").movements).toEqual([{ type: "EXIT", lotId: "late", quantity: 4, balanceAfter: 6 }]);
  });

  it("rejects a specific lot that is expired, held or short", () => {
    const lots = [expired(), makeLot({ id: "b", status: "BLOCKED", expiryDate: "2027-01-01" }), makeLot({ id: "c", currentQuantity: 2 })];
    expect(() => planExit(lots, 1, TODAY, "old")).toThrow(ExpiredLotError);
    expect(() => planExit(lots, 1, TODAY, "b")).toThrow(LotNotUsableError);
    expect(() => planExit(lots, 3, TODAY, "c")).toThrow(InsufficientStockError);
    expect(userTextOf(() => planExit(lots, 1, TODAY, "missing"))).toMatch(/no pertenece/);
  });
});

describe("removals: ADJUSTMENT_OUT, WRITE_OFF, RETURN", () => {
  it("accepts write-off and return on an expired lot", () => {
    for (const type of ["WRITE_OFF", "RETURN"] as const) {
      const plan = planRemoval(expired(), type, 6, TODAY);
      expect(plan.movements).toEqual([{ type, lotId: "old", quantity: 6, balanceAfter: 0 }]);
      expect(plan.updates[0]).toMatchObject({ currentQuantity: 0, status: "DEPLETED" });
    }
  });

  it("rejects an adjustment out of an expired lot", () => {
    expect(() => planRemoval(expired(), "ADJUSTMENT_OUT", 1, TODAY)).toThrow(ExpiredLotError);
  });

  it("cannot remove more than is physically there", () => {
    expect(() => planRemoval(makeLot({ id: "a", currentQuantity: 3 }), "WRITE_OFF", 4, TODAY)).toThrow(InsufficientStockError);
  });

  it("may take blocked units and clamps the blocked counter", () => {
    const plan = planRemoval(makeLot({ id: "a", currentQuantity: 10, blockedQuantity: 8 }), "WRITE_OFF", 5, TODAY);
    expect(plan.updates[0]).toMatchObject({ currentQuantity: 5, blockedQuantity: 5, status: "AVAILABLE" });
  });

  it("keeps a quarantined lot in quarantine until it is empty", () => {
    const lot = makeLot({ id: "q", status: "QUARANTINE", currentQuantity: 4 });
    expect(planRemoval(lot, "WRITE_OFF", 3, TODAY).updates[0].status).toBe("QUARANTINE");
    expect(planRemoval(lot, "WRITE_OFF", 4, TODAY).updates[0].status).toBe("DEPLETED");
  });
});

describe("additions: ENTRY and ADJUSTMENT_IN", () => {
  it("adds to an existing lot and revives a depleted one", () => {
    const plan = planAddition(makeLot({ id: "a", currentQuantity: 0, status: "DEPLETED" }), "ENTRY", 12, TODAY);
    expect(plan.movements).toEqual([{ type: "ENTRY", lotId: "a", quantity: 12, balanceAfter: 12 }]);
    expect(plan.updates[0]).toMatchObject({ currentQuantity: 12, status: "AVAILABLE" });
  });

  it("rejects adding stock to an expired lot", () => {
    expect(() => planAddition(expired(), "ENTRY", 1, TODAY)).toThrow(ExpiredLotError);
    expect(() => planAddition(expired(), "ADJUSTMENT_IN", 1, TODAY)).toThrow(ExpiredLotError);
  });

  it("rejects receiving a new lot that is already expired, but accepts one expiring today", () => {
    expect(userTextOf(() => assertNewLotExpiry("2026-10-24", TODAY))).toMatch(/ya pasó/);
    expect(() => assertNewLotExpiry("2026-10-25", TODAY)).not.toThrow();
  });
});

describe("BLOCK / UNBLOCK", () => {
  it("blocks some units without changing the physical quantity", () => {
    const plan = planBlock(makeLot({ id: "a", currentQuantity: 10, blockedQuantity: 2 }), "UNITS", 5, TODAY);
    expect(plan.updates[0]).toMatchObject({ currentQuantity: 10, blockedQuantity: 7 });
    expect(plan.movements).toEqual([{ type: "BLOCK", lotId: "a", quantity: 5, balanceAfter: 10 }]);
  });

  it("cannot block more units than are free", () => {
    expect(() => planBlock(makeLot({ id: "a", currentQuantity: 10, blockedQuantity: 8 }), "UNITS", 3, TODAY)).toThrow(
      InsufficientStockError,
    );
  });

  it("puts the whole lot in quarantine or blocked, recording its full quantity", () => {
    for (const mode of ["QUARANTINE", "BLOCKED"] as const) {
      const plan = planBlock(makeLot({ id: "a", currentQuantity: 9 }), mode, 1, TODAY);
      expect(plan.updates[0].status).toBe(mode);
      expect(plan.movements[0]).toMatchObject({ type: "BLOCK", quantity: 9, balanceAfter: 9 });
    }
  });

  it("rejects blocking an expired, depleted or already held lot", () => {
    expect(() => planBlock(expired(), "QUARANTINE", 1, TODAY)).toThrow(ExpiredLotError);
    expect(() => planBlock(makeLot({ id: "a", currentQuantity: 0, status: "DEPLETED" }), "BLOCKED", 1, TODAY)).toThrow(LotNotUsableError);
    expect(() => planBlock(makeLot({ id: "a", status: "QUARANTINE" }), "BLOCKED", 1, TODAY)).toThrow(LotNotUsableError);
    expect(() => planBlock(makeLot({ id: "a", status: "BLOCKED" }), "UNITS", 1, TODAY)).toThrow(LotNotUsableError);
  });

  it("releases held units, never more than are held", () => {
    const lot = makeLot({ id: "a", currentQuantity: 10, blockedQuantity: 4 });
    expect(planUnblock(lot, "UNITS", 3, TODAY).updates[0]).toMatchObject({ blockedQuantity: 1 });
    expect(() => planUnblock(lot, "UNITS", 5, TODAY)).toThrow(InsufficientStockError);
  });

  it("puts a quarantined or blocked lot back in service", () => {
    const plan = planUnblock(makeLot({ id: "a", currentQuantity: 6, status: "QUARANTINE" }), "LOT", 1, TODAY);
    expect(plan.updates[0].status).toBe("AVAILABLE");
    expect(plan.movements[0]).toMatchObject({ type: "UNBLOCK", quantity: 6 });
    expect(() => planUnblock(makeLot({ id: "a" }), "LOT", 1, TODAY)).toThrow(LotNotUsableError);
  });

  it("rejects unblocking an expired lot", () => {
    expect(() => planUnblock(expired({ status: "QUARANTINE" }), "LOT", 1, TODAY)).toThrow(ExpiredLotError);
  });
});

describe("movement type metadata", () => {
  it("knows the direction of every type", () => {
    expect(stockDirection("ENTRY")).toBe(1);
    expect(stockDirection("ADJUSTMENT_IN")).toBe(1);
    for (const type of ["EXIT", "ADJUSTMENT_OUT", "RETURN", "WRITE_OFF"] as const) expect(stockDirection(type)).toBe(-1);
    expect(stockDirection("BLOCK")).toBe(0);
    expect(stockDirection("UNBLOCK")).toBe(0);
  });

  it("requires a reason for everything but entries and exits", () => {
    expect(requiresReason("ENTRY")).toBe(false);
    expect(requiresReason("EXIT")).toBe(false);
    for (const type of ["ADJUSTMENT_IN", "ADJUSTMENT_OUT", "RETURN", "WRITE_OFF", "BLOCK", "UNBLOCK"] as const) {
      expect(requiresReason(type)).toBe(true);
    }
  });

  it("maps types to the reason catalog", () => {
    expect(reasonKindFor("WRITE_OFF")).toBe("WRITE_OFF");
    expect(reasonKindFor("RETURN")).toBe("RETURN");
    expect(reasonKindFor("BLOCK")).toBe("ADJUSTMENT");
    expect(reasonKindFor("EXIT")).toBeNull();
  });

  it("only write-off, return and count corrections are allowed on expired lots", () => {
    const allowed = (["ENTRY", "EXIT", "ADJUSTMENT_IN", "ADJUSTMENT_OUT", "RETURN", "WRITE_OFF", "BLOCK", "UNBLOCK", "COUNT_CORRECTION"] as const).filter(
      allowedOnExpiredLot,
    );
    expect(allowed).toEqual(["RETURN", "WRITE_OFF", "COUNT_CORRECTION"]);
  });
});
