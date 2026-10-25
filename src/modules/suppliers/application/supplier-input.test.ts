import { describe, expect, it } from "vitest";
import { supplierInputSchema } from "./supplier-input";

const parse = (input: Record<string, unknown>) => supplierInputSchema.safeParse(input);

describe("supplier input schema", () => {
  it("accepts a minimal supplier and defaults the optional fields", () => {
    const result = parse({ name: "  Droguería Norte  " });
    expect(result.success && result.data).toEqual({
      name: "Droguería Norte",
      cuit: null,
      contactName: null,
      phone: null,
      email: null,
      address: null,
      visitDays: [],
      deliveryHours: null,
      leadTimeDays: null,
      status: "ACTIVE",
      notes: null,
    });
  });

  it("stores the CUIT as digits and rejects an invalid check digit", () => {
    const ok = parse({ name: "A", cuit: "30-50001091-2" });
    expect(ok.success && ok.data.cuit).toBe("30500010912");
    const bad = parse({ name: "A", cuit: "30-50001091-3" });
    expect(!bad.success && bad.error.issues[0].path).toEqual(["cuit"]);
    expect(parse({ name: "A", cuit: "" }).success).toBe(true);
  });

  it("requires a name and a valid email when given", () => {
    expect(parse({ name: "  " }).success).toBe(false);
    expect(parse({ name: "A", email: "no-es-un-email" }).success).toBe(false);
    const ok = parse({ name: "A", email: "ventas@proveedor.com.ar" });
    expect(ok.success && ok.data.email).toBe("ventas@proveedor.com.ar");
  });

  it("normalizes visit days and validates the lead time", () => {
    const ok = parse({ name: "A", visitDays: ["5", "1", "5", "9"], leadTimeDays: "3" });
    expect(ok.success && ok.data.visitDays).toEqual([1, 5]);
    expect(ok.success && ok.data.leadTimeDays).toBe(3);
    expect(parse({ name: "A", leadTimeDays: "-1" }).success).toBe(false);
    expect(parse({ name: "A", leadTimeDays: "400" }).success).toBe(false);
    expect(parse({ name: "A", leadTimeDays: "1.5" }).success).toBe(false);
  });

  it("rejects an unknown status", () => {
    expect(parse({ name: "A", status: "ARCHIVED" }).success).toBe(false);
    const ok = parse({ name: "A", status: "INACTIVE" });
    expect(ok.success && ok.data.status).toBe("INACTIVE");
  });
});
