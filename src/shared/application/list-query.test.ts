import { describe, expect, it } from "vitest";
import { buildHref, firstParam, pageCount, pageRange, parseOption, parsePage, parseSortDirection, uuidParam } from "./list-query";

describe("list query helpers", () => {
  it("reads the first non-empty value of a param", () => {
    expect(firstParam(["  a ", "b"])).toBe("a");
    expect(firstParam("   ")).toBeUndefined();
    expect(firstParam(undefined)).toBeUndefined();
  });

  it("keeps only UUIDs for id filters", () => {
    expect(uuidParam("7f6b1d2e-3c4a-4b5d-8e9f-0a1b2c3d4e5f")).toBe("7f6b1d2e-3c4a-4b5d-8e9f-0a1b2c3d4e5f");
    expect(uuidParam("nope")).toBeUndefined();
    expect(uuidParam(undefined)).toBeUndefined();
  });

  it("falls back to page 1 for invalid pages", () => {
    expect(parsePage("3")).toBe(3);
    expect(parsePage("0")).toBe(1);
    expect(parsePage("-4")).toBe(1);
    expect(parsePage("abc")).toBe(1);
    expect(parsePage(undefined)).toBe(1);
  });

  it("accepts only known sort directions and options", () => {
    expect(parseSortDirection("desc")).toBe("desc");
    expect(parseSortDirection("sideways", "desc")).toBe("desc");
    expect(parseOption("name", ["name", "code"] as const, "code")).toBe("name");
    expect(parseOption("evil", ["name", "code"] as const, "code")).toBe("code");
  });

  it("computes page counts and ranges", () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(41, 20)).toBe(3);
    expect(pageRange(2, 20, 53)).toEqual({ from: 21, to: 40 });
    expect(pageRange(3, 20, 53)).toEqual({ from: 41, to: 53 });
    expect(pageRange(1, 20, 0)).toEqual({ from: 0, to: 0 });
  });

  it("builds hrefs skipping empty values", () => {
    expect(buildHref("/productos", { q: "ibu profeno", page: 2, status: "", x: undefined })).toBe(
      "/productos?q=ibu+profeno&page=2",
    );
    expect(buildHref("/productos", {})).toBe("/productos");
  });
});
