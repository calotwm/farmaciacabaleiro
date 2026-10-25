import { describe, expect, it } from "vitest";
import { evaluateStockLevel } from "./low-stock";

describe("evaluateStockLevel", () => {
  it("is OUT_OF_STOCK when nothing is available", () => {
    expect(evaluateStockLevel(0, 5)).toBe("OUT_OF_STOCK");
    expect(evaluateStockLevel(0, 0)).toBe("OUT_OF_STOCK");
  });

  it("is LOW_STOCK at or below the minimum", () => {
    expect(evaluateStockLevel(5, 5)).toBe("LOW_STOCK");
    expect(evaluateStockLevel(1, 5)).toBe("LOW_STOCK");
  });

  it("has no alert above the minimum", () => {
    expect(evaluateStockLevel(6, 5)).toBeNull();
    expect(evaluateStockLevel(1, 0)).toBeNull();
  });
});
