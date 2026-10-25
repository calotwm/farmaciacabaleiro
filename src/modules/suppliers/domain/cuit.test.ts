import { describe, expect, it } from "vitest";
import { cuitCheckDigit, formatCuit, isValidCuit, normalizeCuit } from "./cuit";

describe("CUIT", () => {
  it("accepts well-formed CUITs with or without separators", () => {
    expect(isValidCuit("20-12345678-6")).toBe(true);
    expect(isValidCuit("20123456786")).toBe(true);
    expect(isValidCuit(" 20 12345678 6 ")).toBe(true);
    expect(isValidCuit("30-50001091-2")).toBe(true);
  });

  it("rejects a wrong check digit, length, prefix or characters", () => {
    expect(isValidCuit("20-12345678-5")).toBe(false);
    expect(isValidCuit("20-1234567-6")).toBe(false);
    expect(isValidCuit("20-123456789-6")).toBe(false);
    expect(isValidCuit("99-12345678-6")).toBe(false);
    expect(isValidCuit("20-1234567A-6")).toBe(false);
    expect(isValidCuit("")).toBe(false);
  });

  it("computes the check digit, mapping remainder 0 to 0 and rejecting remainder 10", () => {
    expect(cuitCheckDigit("2012345678")).toBe(6);
    expect(cuitCheckDigit("3050001091")).toBe(2);
    // Weighted sum 22 -> 22 % 11 = 0 -> 11 - 0 = 11 -> check digit 0.
    expect(cuitCheckDigit("2040000000")).toBe(0);
    expect(isValidCuit("20-40000000-0")).toBe(true);
    // Weighted sum 12 -> 12 % 11 = 1 -> 11 - 1 = 10 -> no valid check digit.
    expect(cuitCheckDigit("2001000000")).toBeNull();
    expect(isValidCuit("20-01000000-0")).toBe(false);
  });

  it("normalizes and formats", () => {
    expect(normalizeCuit("20-12345678-6")).toBe("20123456786");
    expect(formatCuit("20123456786")).toBe("20-12345678-6");
    expect(formatCuit("123")).toBe("123");
  });
});
