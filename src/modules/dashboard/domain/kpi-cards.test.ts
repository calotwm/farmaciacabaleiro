import { describe, expect, it } from "vitest";
import { buildDeliveryCards, buildStockCards } from "./kpi-cards";

const stock = {
  activeProducts: 10,
  totalUnits: 120,
  lowStock: 2,
  outOfStock: 0,
  expiring: [
    { days: 30, count: 1 },
    { days: 90, count: 4 },
  ],
  expiredWithStock: 1,
};

describe("buildStockCards", () => {
  const cards = buildStockCards(stock, "2026-10-25");
  const byId = (id: string) => cards.find((card) => card.id === id);

  it("links each card to the matching filtered list", () => {
    expect(byId("low")?.href).toBe("/productos?stock=low");
    expect(byId("expired")?.href).toBe("/lotes?status=EXPIRED&withStock=1");
    expect(byId("expiring")?.href).toBe("/lotes?expiryFrom=2026-10-25&expiryTo=2027-01-23");
  });

  it("uses the widest window as the expiring total and keeps a breakdown per threshold", () => {
    expect(byId("expiring")?.value).toBe(4);
    expect(byId("expiring")?.breakdown?.map((b) => [b.label, b.value])).toEqual([
      ["30 días", 1],
      ["90 días", 4],
    ]);
  });

  it("says which window the expiring count covers", () => {
    expect(byId("expiring")?.caption).toBe("hasta 90 días");
    expect(byId("low")?.caption).toBeUndefined();
  });

  it("marks only non-zero problem cards", () => {
    expect(byId("low")?.tone).toBe("warning");
    expect(byId("out")?.tone).toBe("default");
    expect(byId("expired")?.tone).toBe("danger");
  });
});

describe("buildDeliveryCards", () => {
  it("builds AR-day ranges for today and the next 7 days", () => {
    const cards = buildDeliveryCards({ today: 1, next7Days: 3, late: 0, pendingConfirmation: 2 }, "2026-10-25");
    expect(cards.map((card) => card.href)).toEqual([
      "/entregas?from=2026-10-25&to=2026-10-25&open=1",
      "/entregas?from=2026-10-25&to=2026-11-01&open=1",
      "/entregas?late=1",
      "/entregas?status=SCHEDULED&from=2026-10-25",
    ]);
  });
});
