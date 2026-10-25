import { describe, expect, it } from "vitest";
import { formatMoney } from "./money";

// Intl uses a non-breaking space after the symbol; normalize for readable assertions.
const flat = (value: string) => value.replace(/\s/g, " ");

describe("formatMoney", () => {
  it("formats ARS in es-AR by default", () => {
    expect(flat(formatMoney(1234.5))).toBe("$ 1.234,50");
    expect(flat(formatMoney(0))).toBe("$ 0,00");
    expect(flat(formatMoney(1234567.891))).toBe("$ 1.234.567,89");
  });

  it("accepts decimal strings without losing precision", () => {
    expect(flat(formatMoney("12345678901234567.89"))).toBe("$ 12.345.678.901.234.567,89");
    expect(flat(formatMoney("0.10"))).toBe("$ 0,10");
  });

  it("accepts Decimal-like objects", () => {
    const decimal = { toString: () => "99.9" };
    expect(flat(formatMoney(decimal))).toBe("$ 99,90");
  });

  it("formats negatives", () => {
    expect(flat(formatMoney("-15.5"))).toContain("15,50");
    expect(formatMoney("-15.5")).toContain("-");
  });

  it("supports other currencies and locales", () => {
    expect(flat(formatMoney(10, { currency: "USD", locale: "en-US" }))).toBe("$10.00");
    expect(formatMoney(10, { currency: "EUR" })).toContain("10,00");
  });

  it("rejects invalid amounts", () => {
    expect(() => formatMoney("abc")).toThrow(RangeError);
    expect(() => formatMoney("")).toThrow(RangeError);
    expect(() => formatMoney(Number.NaN)).toThrow(RangeError);
    expect(() => formatMoney(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});
