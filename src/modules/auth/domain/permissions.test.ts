import { describe, expect, it } from "vitest";
import { ForbiddenError } from "@/shared/domain/errors";
import { PERMISSION_KEYS, assertPermission, hasPermission } from "./permissions";

const employee = { roleName: "employee", permissions: ["products.read", "inventory.read"] };
const admin = { roleName: "admin", permissions: [] };

describe("hasPermission", () => {
  it("grants only the permissions assigned to the role", () => {
    expect(hasPermission(employee, "products.read")).toBe(true);
    expect(hasPermission(employee, "users.manage")).toBe(false);
  });

  it("gives admin every permission", () => {
    for (const key of PERMISSION_KEYS) expect(hasPermission(admin, key)).toBe(true);
  });

  it("does not treat unknown roles as admin", () => {
    expect(hasPermission({ roleName: "administrator", permissions: [] }, "users.manage")).toBe(false);
  });
});

describe("assertPermission", () => {
  it("throws ForbiddenError carrying the missing permission", () => {
    expect(() => assertPermission(employee, "users.manage")).toThrow(ForbiddenError);
    try {
      assertPermission(employee, "users.manage");
    } catch (error) {
      expect((error as ForbiddenError).permission).toBe("users.manage");
    }
  });

  it("passes silently when allowed", () => {
    expect(() => assertPermission(employee, "inventory.read")).not.toThrow();
  });
});
