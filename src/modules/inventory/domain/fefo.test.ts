import { describe, expect, it } from "vitest";
import { InsufficientStockError } from "./errors";
import { type FefoCandidate, allocateFefo, compareFefo, firstUsableLot, sortFefo, toFefoCandidates } from "./fefo";
import { makeLot, userTextOf } from "./lot-fixtures";

const TODAY = "2026-10-25";

function candidate(id: string, expiryDate: string, available: number, receivedAt = "2026-01-01T00:00:00Z"): FefoCandidate {
  return { id, lotNumber: id.toUpperCase(), expiryDate, receivedAt: new Date(receivedAt), available };
}

describe("FEFO ordering", () => {
  it("orders by expiry, then receipt date, then lot number", () => {
    const lots = [
      makeLot({ id: "c", lotNumber: "B", expiryDate: "2027-01-01", receivedAt: new Date("2026-02-01") }),
      makeLot({ id: "d", lotNumber: "A", expiryDate: "2027-01-01", receivedAt: new Date("2026-02-01") }),
      makeLot({ id: "b", lotNumber: "Z", expiryDate: "2027-01-01", receivedAt: new Date("2026-01-01") }),
      makeLot({ id: "a", lotNumber: "Z", expiryDate: "2026-12-31", receivedAt: new Date("2026-06-01") }),
    ];
    expect(sortFefo(lots).map((lot) => lot.id)).toEqual(["a", "b", "d", "c"]);
  });

  it("does not mutate its input", () => {
    const lots = [makeLot({ id: "b", expiryDate: "2028-01-01" }), makeLot({ id: "a", expiryDate: "2027-01-01" })];
    sortFefo(lots);
    expect(lots.map((lot) => lot.id)).toEqual(["b", "a"]);
  });

  it("compares equal lots as 0", () => {
    const lot = makeLot({ id: "a" });
    expect(compareFefo(lot, { ...lot })).toBe(0);
  });
});

describe("allocateFefo", () => {
  it("takes everything from the earliest lot when it is enough", () => {
    const result = allocateFefo([candidate("b", "2027-06-01", 10), candidate("a", "2027-01-01", 10)], 4);
    expect(result).toEqual([{ lotId: "a", lotNumber: "A", quantity: 4 }]);
  });

  it("spills over to the next lot, earliest expiry first", () => {
    const result = allocateFefo([candidate("c", "2028-01-01", 10), candidate("a", "2027-01-01", 3), candidate("b", "2027-06-01", 5)], 9);
    expect(result).toEqual([
      { lotId: "a", lotNumber: "A", quantity: 3 },
      { lotId: "b", lotNumber: "B", quantity: 5 },
      { lotId: "c", lotNumber: "C", quantity: 1 },
    ]);
  });

  it("uses the exact total without leftovers", () => {
    const result = allocateFefo([candidate("a", "2027-01-01", 3), candidate("b", "2027-06-01", 2)], 5);
    expect(result.map((r) => r.quantity)).toEqual([3, 2]);
  });

  it("breaks expiry ties by receipt date, then lot number", () => {
    const result = allocateFefo(
      [candidate("b", "2027-01-01", 5, "2026-03-01T00:00:00Z"), candidate("a", "2027-01-01", 5, "2026-02-01T00:00:00Z")],
      6,
    );
    expect(result.map((r) => r.lotId)).toEqual(["a", "b"]);
  });

  it("states the available quantity when stock is insufficient", () => {
    const attempt = () => allocateFefo([candidate("a", "2027-01-01", 3), candidate("b", "2027-06-01", 2)], 6);
    expect(attempt).toThrow(InsufficientStockError);
    try {
      attempt();
    } catch (error) {
      expect(error).toMatchObject({ available: 5, requested: 6 });
      expect((error as InsufficientStockError).userMessage).toContain("hay 5 unidades disponibles");
    }
  });

  it("fails with 0 available when there are no candidates", () => {
    expect(userTextOf(() => allocateFefo([], 1))).toMatch(/hay 0 unidades/);
  });
});

describe("toFefoCandidates / firstUsableLot", () => {
  const lots = [
    makeLot({ id: "expired", expiryDate: "2026-10-01" }),
    makeLot({ id: "quarantine", expiryDate: "2026-11-01", status: "QUARANTINE" }),
    makeLot({ id: "empty", expiryDate: "2026-12-01", currentQuantity: 0, status: "DEPLETED" }),
    makeLot({ id: "held", expiryDate: "2027-01-01", currentQuantity: 5, blockedQuantity: 5 }),
    makeLot({ id: "good-late", expiryDate: "2028-01-01", currentQuantity: 7, blockedQuantity: 2 }),
    makeLot({ id: "good-early", expiryDate: "2027-03-01", currentQuantity: 4 }),
  ];

  it("keeps only lots that can serve a normal exit, with their usable units, in FEFO order", () => {
    expect(toFefoCandidates(lots, TODAY).map((c) => [c.id, c.available])).toEqual([
      ["good-early", 4],
      ["good-late", 5],
    ]);
  });

  it("marks the earliest-expiring usable lot as the one to use first", () => {
    expect(firstUsableLot(lots, TODAY)?.id).toBe("good-early");
    expect(firstUsableLot([lots[0], lots[1]], TODAY)).toBeNull();
  });
});
