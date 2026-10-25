import { describe, expect, it } from "vitest";
import { normalizeBarcode } from "./barcode";

describe("normalizeBarcode", () => {
  it("strips whitespace and control characters added by scanners", () => {
    expect(normalizeBarcode("7790001234567\r\n")).toBe("7790001234567");
    expect(normalizeBarcode("  7790 0012\t34567 ")).toBe("7790001234567");
  });

  it("keeps printable characters of alphanumeric symbologies", () => {
    expect(normalizeBarcode("AB-12.34/x")).toBe("AB-12.34/x");
  });

  it("returns an empty string for blank input", () => {
    expect(normalizeBarcode(" \r\n")).toBe("");
  });
});
