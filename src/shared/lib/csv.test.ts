import { describe, expect, it } from "vitest";
import { CSV_BOM, escapeCsvCell, toCsv } from "./csv";

describe("escapeCsvCell", () => {
  it("leaves plain text alone and renders null/undefined as empty", () => {
    expect(escapeCsvCell("Ibuprofeno")).toBe("Ibuprofeno");
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell(undefined)).toBe("");
  });

  it("quotes fields with separator, quotes or line breaks and doubles inner quotes", () => {
    expect(escapeCsvCell("a;b")).toBe('"a;b"');
    expect(escapeCsvCell('di "x"')).toBe('"di ""x"""');
    expect(escapeCsvCell("l1\nl2")).toBe('"l1\nl2"');
  });

  it("does not quote commas (the separator is a semicolon)", () => {
    expect(escapeCsvCell("a,b")).toBe("a,b");
  });

  it.each(["=SUM(A1)", "+1", "-1+2", "@cmd", "\tx"])("neutralizes formula injection in %j", (value) => {
    expect(escapeCsvCell(value).replaceAll('"', "").startsWith("'")).toBe(true);
  });

  it("keeps numbers numeric, including negatives", () => {
    expect(escapeCsvCell(-5)).toBe("-5");
    expect(escapeCsvCell(0)).toBe("0");
    expect(escapeCsvCell(Number.NaN)).toBe("");
  });
});

describe("toCsv", () => {
  it("starts with the BOM and uses ; and CRLF", () => {
    const csv = toCsv(["A", "B"], [["x", 1], ["y;z", null]]);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    expect(csv.slice(1)).toBe('A;B\r\nx;1\r\n"y;z";\r\n');
  });

  it("emits only the header for no rows", () => {
    expect(toCsv(["A"], [])).toBe(`${CSV_BOM}A\r\n`);
  });
});
