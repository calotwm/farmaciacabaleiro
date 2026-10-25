import { describe, expect, it } from "vitest";
import { isDomainError } from "@/shared/domain/errors";
import {
  DELIVERY_STATUSES,
  DELIVERY_TYPES,
  allowedTransitions,
  assertTransition,
  canTransition,
  deliveryStatusLabel,
  isOpenDelivery,
} from "./delivery-status";

describe("delivery status machine", () => {
  it("a scheduled delivery can be confirmed, received, rescheduled or cancelled", () => {
    expect(allowedTransitions("SCHEDULED", "DELIVERY")).toEqual(["CONFIRMED", "RECEIVED", "RESCHEDULED", "CANCELLED"]);
  });

  it("a confirmed delivery can be received, rescheduled or cancelled but not confirmed again", () => {
    expect(allowedTransitions("CONFIRMED", "DELIVERY")).toEqual(["RECEIVED", "RESCHEDULED", "CANCELLED"]);
    expect(canTransition("CONFIRMED", "CONFIRMED", "DELIVERY")).toBe(false);
  });

  it("visits end as COMPLETED instead of RECEIVED", () => {
    for (const type of ["SALES_VISIT", "ORDER_TAKING", "OTHER"] as const) {
      expect(allowedTransitions("SCHEDULED", type)).toEqual(["CONFIRMED", "COMPLETED", "RESCHEDULED", "CANCELLED"]);
      expect(canTransition("SCHEDULED", "RECEIVED", type)).toBe(false);
    }
    expect(canTransition("SCHEDULED", "COMPLETED", "DELIVERY")).toBe(false);
  });

  it("RECEIVED, COMPLETED, CANCELLED and RESCHEDULED are terminal for every type", () => {
    for (const type of DELIVERY_TYPES) {
      for (const status of ["RECEIVED", "COMPLETED", "CANCELLED", "RESCHEDULED"] as const) {
        expect(allowedTransitions(status, type)).toEqual([]);
        expect(isOpenDelivery(status)).toBe(false);
        for (const target of DELIVERY_STATUSES) expect(canTransition(status, target, type)).toBe(false);
      }
    }
  });

  it("never goes back to SCHEDULED", () => {
    for (const from of DELIVERY_STATUSES) expect(canTransition(from, "SCHEDULED", "DELIVERY")).toBe(false);
  });

  it("assertTransition throws a conflict with a Spanish message", () => {
    expect(() => assertTransition("SCHEDULED", "CONFIRMED", "DELIVERY")).not.toThrow();
    const attempt = (from: Parameters<typeof assertTransition>[0], to: Parameters<typeof assertTransition>[1], type: Parameters<typeof assertTransition>[2]) => {
      try {
        assertTransition(from, to, type);
      } catch (error) {
        return error;
      }
    };
    const closed = attempt("CANCELLED", "CONFIRMED", "DELIVERY");
    expect(isDomainError(closed) && closed.code).toBe("CONFLICT");
    expect(isDomainError(closed) && closed.userMessage).toBe("La entrega ya está cancelada y no admite más cambios.");
    expect((attempt("SCHEDULED", "RECEIVED", "SALES_VISIT") as { userMessage?: string }).userMessage).toBe(
      "Solo un reparto puede recibirse. Las visitas se marcan como realizadas.",
    );
    expect((attempt("SCHEDULED", "COMPLETED", "DELIVERY") as { userMessage?: string }).userMessage).toBe(
      "Una entrega se cierra al recibir la mercadería, no se marca como realizada.",
    );
  });

  it("has Spanish labels", () => {
    expect(deliveryStatusLabel("RECEIVED")).toBe("Recibida");
    expect(deliveryStatusLabel("COMPLETED")).toBe("Realizada");
    expect(deliveryStatusLabel("SCHEDULED")).toBe("Programada");
  });
});
