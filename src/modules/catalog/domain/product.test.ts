import { describe, expect, it } from "vitest";
import { generateProductCode, isArchived } from "./product";

describe("product domain", () => {
  it("only ARCHIVED products are archived", () => {
    expect(isArchived("ARCHIVED")).toBe(true);
    expect(isArchived("ACTIVE")).toBe(false);
    expect(isArchived("INACTIVE")).toBe(false);
  });

  it("generates codes with the P- prefix and 8 allowed characters", () => {
    const code = generateProductCode();
    expect(code).toMatch(/^P-[0-9A-HJ-NP-Z]{8}$/);
  });

  it("is deterministic for a given byte source", () => {
    let n = 0;
    expect(generateProductCode(() => n++)).toBe("P-01234567");
  });
});
