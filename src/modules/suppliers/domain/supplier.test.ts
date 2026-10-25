import { describe, expect, it } from "vitest";
import { formatVisitDays, normalizeVisitDays } from "./supplier";

describe("visit days", () => {
  it("sorts, de-duplicates and drops values outside 1..7", () => {
    expect(normalizeVisitDays([5, 1, 5, 0, 8, 3])).toEqual([1, 3, 5]);
    expect(normalizeVisitDays([])).toEqual([]);
  });

  it("formats with short Spanish names", () => {
    expect(formatVisitDays([5, 1, 3])).toBe("Lun, Mié, Vie");
    expect(formatVisitDays([7])).toBe("Dom");
    expect(formatVisitDays([])).toBe("");
  });
});
