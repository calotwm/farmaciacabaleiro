import { describe, expect, it } from "vitest";
import { DEFAULT_GENERAL_SETTINGS, parseThresholds, resolveGeneralSettings } from "./general-settings";

describe("parseThresholds", () => {
  it("sorts largest first and removes duplicates", () => {
    expect(parseThresholds("30, 90,7 , 90")).toEqual([90, 30, 7]);
  });

  it.each(["", "  ", "a", "0", "-5", "1.5", "30,x", "99999"])("rejects %j", (text) => {
    expect(parseThresholds(text)).toBeNull();
  });
});

describe("resolveGeneralSettings", () => {
  it("falls back to defaults for missing or malformed values", () => {
    expect(resolveGeneralSettings({})).toEqual(DEFAULT_GENERAL_SETTINGS);
    expect(resolveGeneralSettings({ expiryThresholds: ["x"], defaultMinStock: -1, currency: "peso" })).toEqual(DEFAULT_GENERAL_SETTINGS);
  });

  it("uses valid stored values", () => {
    expect(resolveGeneralSettings({ pharmacyName: " Mi farmacia ", expiryThresholds: [30, 60], defaultMinStock: 5, currency: "USD" })).toEqual({
      pharmacyName: "Mi farmacia",
      expiryThresholds: [60, 30],
      defaultMinStock: 5,
      currency: "USD",
    });
  });
});
