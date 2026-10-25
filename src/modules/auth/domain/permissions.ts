import { ForbiddenError } from "@/shared/domain/errors";

/** Permission keys seeded in `prisma/seed.ts`. */
export const PERMISSION_KEYS = [
  "products.read",
  "products.write",
  "products.archive",
  "catalog.manage",
  "inventory.read",
  "inventory.write",
  "inventory.writeoff",
  "inventory.count",
  "suppliers.read",
  "suppliers.write",
  "deliveries.read",
  "deliveries.write",
  "receiving.read",
  "receiving.write",
  "reports.read",
  "reports.export",
  "audit.read",
  "users.manage",
  "settings.manage",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export const ADMIN_ROLE = "admin";
export const EMPLOYEE_ROLE = "employee";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  roleName: string;
  permissions: readonly string[];
}

/** Admin has every permission; other roles only the ones granted through RolePermission. */
export function hasPermission(user: Pick<AuthUser, "roleName" | "permissions">, key: PermissionKey): boolean {
  return user.roleName === ADMIN_ROLE || user.permissions.includes(key);
}

export function assertPermission(user: Pick<AuthUser, "roleName" | "permissions">, key: PermissionKey): void {
  if (!hasPermission(user, key)) throw new ForbiddenError(key);
}
