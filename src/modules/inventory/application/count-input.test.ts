import { describe, expect, it } from "vitest";
import { closeCountSchema, openCountSchema, parseCountEntries } from "./count-input";

const LOT_A = "7f6b1d2e-3c4a-4b5d-8e9f-0a1b2c3d4e5f";
const LOT_B = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const COUNT_ID = "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("parseCountEntries", () => {
  it("reads counted quantities, treating blanks as not counted and ignoring other fields", () => {
    const { entries, fieldErrors } = parseCountEntries(
      form({ countId: COUNT_ID, [`counted:${LOT_A}`]: " 12 ", [`counted:${LOT_B}`]: "", "counted:not-a-lot": "5" }),
    );
    expect(fieldErrors).toEqual({});
    expect(entries).toEqual([
      { lotId: LOT_A, countedQuantity: 12 },
      { lotId: LOT_B, countedQuantity: null },
    ]);
  });

  it("accepts zero and reports invalid values per field", () => {
    const { entries, fieldErrors } = parseCountEntries(
      form({ [`counted:${LOT_A}`]: "0", [`counted:${LOT_B}`]: "-3" }),
    );
    expect(entries).toEqual([{ lotId: LOT_A, countedQuantity: 0 }]);
    expect(fieldErrors).toEqual({ [`counted:${LOT_B}`]: ["Ingresá un número entero mayor o igual a 0."] });
    expect(parseCountEntries(form({ [`counted:${LOT_A}`]: "1.5" })).fieldErrors).toBeDefined();
    expect(Object.keys(parseCountEntries(form({ [`counted:${LOT_A}`]: "99999999999" })).fieldErrors)).toHaveLength(1);
  });
});

describe("count schemas", () => {
  it("opening a count needs nothing: scope and notes are optional", () => {
    expect(openCountSchema.parse({})).toEqual({ categoryId: null, location: null, notes: null });
    expect(openCountSchema.parse({ categoryId: LOT_A, location: " Góndola 1 ", notes: "" })).toEqual({
      categoryId: LOT_A,
      location: "Góndola 1",
      notes: null,
    });
    expect(openCountSchema.safeParse({ categoryId: "nope" }).success).toBe(false);
  });

  it("closing requires a reason (catalog or detail)", () => {
    const failure = closeCountSchema.safeParse({ countId: COUNT_ID });
    expect(failure.success).toBe(false);
    expect(!failure.success && failure.error.issues[0].message).toMatch(/obligatorio para cerrar/);
    expect(closeCountSchema.safeParse({ countId: COUNT_ID, reasonText: "Inventario anual" }).success).toBe(true);
    expect(closeCountSchema.safeParse({ countId: COUNT_ID, reasonId: LOT_A }).success).toBe(true);
    expect(closeCountSchema.safeParse({ countId: "x", reasonText: "a" }).success).toBe(false);
  });
});
