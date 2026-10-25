import type { RecordAudit } from "@/modules/audit/application/record-audit";
import { ConflictError, NotFoundError, ValidationError } from "@/shared/domain/errors";
import { ADMIN_ROLE, type AuthUser, assertPermission } from "../domain/permissions";
import { validatePassword } from "../domain/password-policy";
import { normalizeEmail } from "./auth-service";
import type { PasswordHasher, SessionRepository, UserRepository } from "./ports";

export interface UserAdminDeps {
  users: UserRepository;
  sessions: SessionRepository;
  hasher: PasswordHasher;
  audit: RecordAudit;
}

export interface CreateUserInput {
  name: string;
  email: string;
  roleName: string;
  password: string;
}

export function createUserAdminService({ users, sessions, hasher, audit }: UserAdminDeps) {
  async function requireRole(roleName: string): Promise<void> {
    const roles = await users.listRoleNames();
    if (!roles.includes(roleName)) {
      throw new ValidationError("Unknown role", { roleName: ["Elegí un rol válido."] });
    }
  }

  function requirePassword(password: string): void {
    const problems = validatePassword(password);
    if (problems.length > 0) throw new ValidationError("Weak password", { password: problems });
  }

  async function listUsers(actor: AuthUser) {
    assertPermission(actor, "users.manage");
    return users.list();
  }

  async function listRoleNames(actor: AuthUser) {
    assertPermission(actor, "users.manage");
    return users.listRoleNames();
  }

  async function createUser(actor: AuthUser, input: CreateUserInput, ip?: string) {
    assertPermission(actor, "users.manage");
    const email = normalizeEmail(input.email);
    const name = input.name.trim();
    if (name.length === 0) throw new ValidationError("Name required", { name: ["Ingresá el nombre."] });
    requirePassword(input.password);
    await requireRole(input.roleName);
    if (await users.findByEmail(email)) {
      throw new ConflictError("Email already registered", "Ya existe un usuario con ese email.");
    }

    const created = await users.create({
      email,
      name,
      roleName: input.roleName,
      passwordHash: await hasher.hash(input.password),
    });
    await audit({
      actorId: actor.id,
      action: "user.create",
      entityType: "user",
      entityId: created.id,
      after: { email, name, role: input.roleName },
      ip,
    });
    return { id: created.id, email, name, roleName: input.roleName };
  }

  async function guardLastAdmin(target: { roleName: string; active: boolean }, userMessage: string) {
    if (target.roleName === ADMIN_ROLE && target.active && (await users.countActiveAdmins()) <= 1) {
      throw new ConflictError("Cannot remove the last active admin", userMessage);
    }
  }

  async function changeRole(actor: AuthUser, userId: string, roleName: string, ip?: string) {
    assertPermission(actor, "users.manage");
    const target = await users.findById(userId);
    if (!target) throw new NotFoundError("user");
    await requireRole(roleName);
    if (target.roleName === roleName) return;
    if (roleName !== ADMIN_ROLE) {
      await guardLastAdmin(target, "Tiene que quedar al menos un administrador activo.");
    }

    await users.updateRole(userId, roleName);
    // Permissions are loaded per request, but cut live sessions so the change is immediate and explicit.
    await sessions.deleteAllForUser(userId);
    await audit({
      actorId: actor.id,
      action: "user.role.change",
      entityType: "user",
      entityId: userId,
      before: { role: target.roleName },
      after: { role: roleName },
      ip,
    });
  }

  async function setActive(actor: AuthUser, userId: string, active: boolean, ip?: string) {
    assertPermission(actor, "users.manage");
    const target = await users.findById(userId);
    if (!target) throw new NotFoundError("user");
    if (target.active === active) return;
    if (!active) {
      if (target.id === actor.id) {
        throw new ConflictError("Cannot deactivate yourself", "No podés desactivar tu propia cuenta.");
      }
      await guardLastAdmin(target, "Tiene que quedar al menos un administrador activo.");
    }

    await users.setActive(userId, active);
    if (!active) await sessions.deleteAllForUser(userId);
    await audit({
      actorId: actor.id,
      action: active ? "user.activate" : "user.deactivate",
      entityType: "user",
      entityId: userId,
      before: { active: target.active },
      after: { active },
      ip,
    });
  }

  /** Bootstrap: creates the first admin without an actor. Refuses to touch an existing account. */
  async function createInitialAdmin(input: { name: string; email: string; password: string }) {
    const email = normalizeEmail(input.email);
    const name = input.name.trim();
    if (name.length === 0) throw new ValidationError("Name required", { name: ["Ingresá el nombre."] });
    requirePassword(input.password);
    if (await users.findByEmail(email)) {
      throw new ConflictError("A user with that email already exists", "Ya existe un usuario con ese email.");
    }
    const created = await users.create({
      email,
      name,
      roleName: ADMIN_ROLE,
      passwordHash: await hasher.hash(input.password),
    });
    await audit({
      action: "user.create",
      entityType: "user",
      entityId: created.id,
      after: { email, name, role: ADMIN_ROLE, bootstrap: true },
    });
    return { id: created.id, email };
  }

  return { listUsers, listRoleNames, createUser, changeRole, setActive, createInitialAdmin };
}

export type UserAdminService = ReturnType<typeof createUserAdminService>;
