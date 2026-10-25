import { describe, expect, it } from "vitest";
import { describeLot, effectiveLotStatus, isExpired, isUsableForExit, usableQuantity } from "./lot";
import { makeLot } from "./lot-fixtures";

const TODAY = "2026-10-25";

describe("effective lot state", () => {
  it("is valid through the whole expiry day and expired from the next one", () => {
    expect(isExpired("2026-10-25", TODAY)).toBe(false);
    expect(isExpired("2026-10-24", TODAY)).toBe(true);
    expect(effectiveLotStatus({ expiryDate: "2026-10-25", status: "AVAILABLE" }, TODAY)).toBe("AVAILABLE");
    expect(effectiveLotStatus({ expiryDate: "2026-10-24", status: "AVAILABLE" }, TODAY)).toBe("EXPIRED");
  });

  it("is EXPIRED regardless of the stored status once the date has passed", () => {
    for (const status of ["AVAILABLE", "QUARANTINE", "BLOCKED", "DEPLETED"] as const) {
      expect(effectiveLotStatus({ expiryDate: "2026-01-01", status }, TODAY)).toBe("EXPIRED");
    }
  });

  it("uses the stored status while the lot has not expired", () => {
    for (const status of ["AVAILABLE", "QUARANTINE", "BLOCKED", "DEPLETED"] as const) {
      expect(effectiveLotStatus({ expiryDate: "2030-01-01", status }, TODAY)).toBe(status);
    }
  });

  it("treats a stored EXPIRED status as expired even before the date", () => {
    expect(effectiveLotStatus({ expiryDate: "2030-01-01", status: "EXPIRED" }, TODAY)).toBe("EXPIRED");
  });
});

describe("usability for normal exits", () => {
  it("only AVAILABLE, non-expired lots are usable", () => {
    expect(isUsableForExit({ expiryDate: "2030-01-01", status: "AVAILABLE" }, TODAY)).toBe(true);
    expect(isUsableForExit({ expiryDate: "2030-01-01", status: "QUARANTINE" }, TODAY)).toBe(false);
    expect(isUsableForExit({ expiryDate: "2030-01-01", status: "BLOCKED" }, TODAY)).toBe(false);
    expect(isUsableForExit({ expiryDate: "2030-01-01", status: "DEPLETED" }, TODAY)).toBe(false);
    expect(isUsableForExit({ expiryDate: "2026-10-24", status: "AVAILABLE" }, TODAY)).toBe(false);
  });

  it("usable quantity excludes individually blocked units and unusable lots", () => {
    expect(usableQuantity(makeLot({ id: "a", currentQuantity: 10, blockedQuantity: 4 }), TODAY)).toBe(6);
    expect(usableQuantity(makeLot({ id: "a", status: "QUARANTINE" }), TODAY)).toBe(0);
    expect(usableQuantity(makeLot({ id: "a", expiryDate: "2026-10-24" }), TODAY)).toBe(0);
  });
});

describe("describeLot", () => {
  it("combines the effective status with the expiry bucket", () => {
    expect(describeLot({ expiryDate: "2026-11-10", status: "AVAILABLE" }, TODAY)).toMatchObject({
      effectiveStatus: "AVAILABLE",
      expiry: { status: "CRITICAL", daysLeft: 16 },
    });
    expect(describeLot({ expiryDate: "2026-10-01", status: "AVAILABLE" }, TODAY)).toMatchObject({
      effectiveStatus: "EXPIRED",
      expiry: { status: "EXPIRED" },
    });
    expect(describeLot({ expiryDate: "2027-12-31", status: "BLOCKED" }, TODAY)).toMatchObject({
      effectiveStatus: "BLOCKED",
      expiry: { status: "NORMAL" },
    });
  });
});
