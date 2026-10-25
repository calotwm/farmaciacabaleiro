import { describe, expect, it } from "vitest";
import { expirySettingsSchema, pharmacySettingsSchema } from "./general-settings-input";

describe("pharmacySettingsSchema", () => {
  it("accepts the pharmacy fields and ignores the thresholds", () => {
    const parsed = pharmacySettingsSchema.safeParse({ pharmacyName: " Farmacia ", defaultMinStock: "5", currency: "usd", expiryThresholds: "x" });
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual({ pharmacyName: "Farmacia", defaultMinStock: 5, currency: "USD" });
  });

  it("rejects a negative minimum and a bad currency code", () => {
    const parsed = pharmacySettingsSchema.safeParse({ pharmacyName: "F", defaultMinStock: "-1", currency: "peso" });
    expect(parsed.success).toBe(false);
  });
});

describe("expirySettingsSchema", () => {
  it("parses the list largest first", () => {
    expect(expirySettingsSchema.parse({ expiryThresholds: "30, 90, 7" })).toEqual({ expiryThresholds: [90, 30, 7] });
  });

  it("rejects text that is not a list of positive days", () => {
    expect(expirySettingsSchema.safeParse({ expiryThresholds: "a, b" }).success).toBe(false);
  });
});
