import { describe, expect, it } from "vitest";
import { planDeliveryAlerts, planLotAlerts } from "./plan-alerts";

const lot = (expiryDate: string, currentQuantity = 3) => ({ id: "lot-1", lotNumber: "A1", expiryDate, currentQuantity, productName: "Ibuprofeno" });

describe("planLotAlerts", () => {
  const thresholds = [90, 30, 7];

  it("raises only the tightest crossed threshold, keyed by the expiry date", () => {
    const [alert, ...rest] = planLotAlerts([lot("2026-11-14")], "2026-10-25", thresholds); // 20 days left
    expect(rest).toEqual([]);
    expect(alert).toMatchObject({ rule: "LOT_EXPIRY_THRESHOLD", thresholdKey: "30", eventDate: "2026-11-14", link: "/lotes/lot-1" });
  });

  it("keeps the same key from one day to the next, and a new one when a tighter threshold is crossed", () => {
    const key = (today: string) => planLotAlerts([lot("2026-11-14")], today, thresholds)[0]?.thresholdKey;
    expect(key("2026-10-25")).toBe(key("2026-10-26"));
    expect(key("2026-11-10")).toBe("7");
  });

  it("raises one expired alert per lot, never for lots without stock or far from expiry", () => {
    expect(planLotAlerts([lot("2026-10-20")], "2026-10-25", thresholds)[0]).toMatchObject({ rule: "LOT_EXPIRED_WITH_STOCK", thresholdKey: "", priority: "CRITICAL" });
    expect(planLotAlerts([lot("2026-10-20", 0)], "2026-10-25", thresholds)).toEqual([]);
    expect(planLotAlerts([lot("2027-10-20")], "2026-10-25", thresholds)).toEqual([]);
  });
});

describe("planDeliveryAlerts", () => {
  const now = new Date("2026-10-25T12:00:00Z"); // 09:00 AR
  const delivery = (scheduledAt: string, status = "SCHEDULED" as const) => ({ id: "d-1", scheduledAt: new Date(scheduledAt), status, supplierName: "Drogueria Sur" });

  it("raises the day-before reminder and a late alert once per delivery", () => {
    expect(planDeliveryAlerts([delivery("2026-10-26T13:00:00Z")], now)).toMatchObject([{ rule: "DELIVERY_UPCOMING", thresholdKey: "days-before-1", eventDate: "2026-10-26" }]);
    expect(planDeliveryAlerts([delivery("2026-10-24T13:00:00Z")], now)).toMatchObject([{ rule: "DELIVERY_LATE", thresholdKey: "", eventDate: "2026-10-24", link: "/entregas/d-1" }]);
  });

  it("ignores closed deliveries", () => {
    expect(planDeliveryAlerts([delivery("2026-10-24T13:00:00Z", "RECEIVED" as never)], now)).toEqual([]);
  });
});
