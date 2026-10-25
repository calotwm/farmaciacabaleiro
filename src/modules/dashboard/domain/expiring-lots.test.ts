import { describe, expect, it } from "vitest";
import { buildExpiringLots, describeDaysLeft, expiringLotsHref } from "./expiring-lots";

const TODAY = "2026-10-25";
const row = (id: string, expiryDate: string) => ({
  id,
  lotNumber: `L-${id}`,
  expiryDate,
  quantity: 3,
  product: { id: `p-${id}`, commercialName: `Producto ${id}` },
});

describe("buildExpiringLots", () => {
  it("sorts by expiry ascending with expired lots first and classifies them", () => {
    const items = buildExpiringLots([row("c", "2026-11-10"), row("a", "2026-10-13"), row("b", "2026-10-29")], TODAY);
    expect(items.map((item) => item.id)).toEqual(["a", "b", "c"]);
    expect(items.map((item) => item.status)).toEqual(["EXPIRED", "CRITICAL", "CRITICAL"]);
    expect(items.map((item) => item.daysLeft)).toEqual([-12, 4, 16]);
    expect(items.map((item) => item.tone)).toEqual(["danger", "danger", "warning"]);
  });

  it("breaks ties by id so the order is stable", () => {
    const items = buildExpiringLots([row("b", "2026-10-30"), row("a", "2026-10-30")], TODAY);
    expect(items.map((item) => item.id)).toEqual(["a", "b"]);
  });
});

describe("describeDaysLeft", () => {
  it("reads naturally for expired, last day, one day and many days", () => {
    expect(describeDaysLeft(-12)).toEqual({ headline: "Vencido", caption: "hace 12 días" });
    expect(describeDaysLeft(-1)).toEqual({ headline: "Vencido", caption: "hace 1 día" });
    expect(describeDaysLeft(0)).toEqual({ headline: "Hoy", caption: "último día" });
    expect(describeDaysLeft(1)).toEqual({ headline: "1", caption: "día" });
    expect(describeDaysLeft(5)).toEqual({ headline: "5", caption: "días" });
  });
});

describe("expiringLotsHref", () => {
  it("links to lots with stock up to the horizon, expired included", () => {
    expect(expiringLotsHref(TODAY)).toBe("/lotes?expiryTo=2026-11-24&withStock=1");
  });
});
