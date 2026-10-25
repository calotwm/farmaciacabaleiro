import { describe, expect, it } from "vitest";
import { isUuid } from "./ids";

describe("isUuid", () => {
  it("accepts UUIDs in any case and rejects everything else", () => {
    expect(isUuid("7f6b1d2e-3c4a-4b5d-8e9f-0a1b2c3d4e5f")).toBe(true);
    expect(isUuid("7F6B1D2E-3C4A-4B5D-8E9F-0A1B2C3D4E5F")).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid("")).toBe(false);
    expect(isUuid("7f6b1d2e-3c4a-4b5d-8e9f-0a1b2c3d4e5f-extra")).toBe(false);
  });
});
