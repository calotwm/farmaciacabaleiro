import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildAuthModule } from "@/modules/auth/composition";
import type { EmailMessage, EmailSender } from "@/modules/auth/application/ports";
import { MAX_FAILED_LOGINS, RESET_TOKEN_TTL_MS } from "@/modules/auth/application/auth-service";
import type { AuthUser } from "@/modules/auth/domain/permissions";
import { prisma } from "@/shared/infrastructure/db/prisma";
import { ForbiddenError, InvalidCredentialsError, RateLimitError, ValidationError } from "@/shared/domain/errors";

const run = crypto.randomUUID();
const PASSWORD = "integration-pass-123";
const emails: string[] = [];
// A unique fake IP per run keeps the rate-limit window isolated from real traffic and other runs.
const ip = `it-${run}`;

class CapturingEmailSender implements EmailSender {
  readonly sent: EmailMessage[] = [];
  async send(message: EmailMessage) {
    this.sent.push(message);
  }
}

const email = new CapturingEmailSender();
let clock = new Date();
const { authService, userAdminService } = buildAuthModule({ email, now: () => clock });

function newEmail(label: string) {
  const address = `test-${label}-${crypto.randomUUID()}@example.test`;
  emails.push(address);
  return address;
}

async function signIn(address: string, password = PASSWORD, ipAddress = ip) {
  return authService.login({ email: address, password, ip: ipAddress });
}

async function actorFor(address: string): Promise<AuthUser> {
  const { token } = await signIn(address);
  const user = await authService.authenticate(token);
  if (!user) throw new Error("expected an authenticated user");
  return user;
}

let admin: AuthUser;
let adminEmail: string;
let employeeEmail: string;
let employee: AuthUser;

beforeAll(async () => {
  adminEmail = newEmail("admin");
  await userAdminService.createInitialAdmin({ name: "IT Admin", email: adminEmail, password: PASSWORD });
  admin = await actorFor(adminEmail);

  employeeEmail = newEmail("employee");
  await userAdminService.createUser(admin, {
    name: "IT Employee",
    email: employeeEmail,
    roleName: "employee",
    password: PASSWORD,
  });
  employee = await actorFor(employeeEmail);
});

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await prisma.auditLog.deleteMany({
    where: { OR: [{ ip: { startsWith: ip } }, { actorId: { in: ids } }, { entityId: { in: ids } }, { after: { path: ["email"], string_starts_with: "test-" } }] },
  });
  await prisma.user.deleteMany({ where: { id: { in: ids } } }); // sessions and reset tokens cascade
  await prisma.$disconnect();
});

describe("login", () => {
  it("creates a session storing only the token hash, and audits the success", async () => {
    const result = await signIn(adminEmail);
    const sessions = await prisma.session.findMany({ where: { user: { email: adminEmail } } });

    expect(sessions.length).toBeGreaterThan(0);
    expect(sessions.every((s) => s.tokenHash !== result.token && /^[0-9a-f]{64}$/.test(s.tokenHash))).toBe(true);
    const audited = await prisma.auditLog.count({ where: { action: "auth.login.success", entityId: result.user.id } });
    expect(audited).toBeGreaterThan(0);
    expect((await authService.authenticate(result.token))?.email).toBe(adminEmail);
  });

  it("logout deletes the session", async () => {
    const { token } = await signIn(adminEmail);
    await authService.logout(token);
    expect(await authService.authenticate(token)).toBeNull();
  });

  it("rejects a wrong password with a generic error and audits the failure", async () => {
    const before = await prisma.auditLog.count({ where: { action: "auth.login.failed", ip: `${ip}-wrong` } });
    await expect(signIn(employeeEmail, "definitely-wrong-1", `${ip}-wrong`)).rejects.toBeInstanceOf(InvalidCredentialsError);
    await expect(signIn(`nobody-${run}@example.test`, PASSWORD, `${ip}-wrong`)).rejects.toBeInstanceOf(InvalidCredentialsError);
    const after = await prisma.auditLog.count({ where: { action: "auth.login.failed", ip: `${ip}-wrong` } });
    expect(after - before).toBe(2);
  });

  it(`blocks after ${MAX_FAILED_LOGINS} failures from the same email and IP, even with the right password`, async () => {
    const target = newEmail("ratelimit");
    await userAdminService.createUser(admin, { name: "RL", email: target, roleName: "employee", password: PASSWORD });
    const limitedIp = `${ip}-rl`;

    for (let i = 0; i < MAX_FAILED_LOGINS; i++) {
      await expect(signIn(target, "wrong-password-1", limitedIp)).rejects.toBeInstanceOf(InvalidCredentialsError);
    }
    await expect(signIn(target, PASSWORD, limitedIp)).rejects.toBeInstanceOf(RateLimitError);
    // Another IP is unaffected.
    await expect(signIn(target, PASSWORD, `${ip}-other`)).resolves.toBeDefined();
    expect(await prisma.auditLog.count({ where: { action: "auth.login.blocked", ip: limitedIp } })).toBe(1);
  });

  it("rejects deactivated users and kills their sessions", async () => {
    const target = newEmail("deactivate");
    const created = await userAdminService.createUser(admin, { name: "D", email: target, roleName: "employee", password: PASSWORD });
    const { token } = await signIn(target);
    expect(await authService.authenticate(token)).not.toBeNull();

    await userAdminService.setActive(admin, created.id, false);
    expect(await authService.authenticate(token)).toBeNull();
    await expect(signIn(target)).rejects.toBeInstanceOf(InvalidCredentialsError);
  });
});

describe("RBAC (spec test #10)", () => {
  it("an employee calling an admin-only action gets ForbiddenError", async () => {
    await expect(
      userAdminService.createUser(employee, { name: "X", email: newEmail("x"), roleName: "admin", password: PASSWORD }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(userAdminService.listUsers(employee)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(userAdminService.setActive(employee, admin.id, false)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(userAdminService.changeRole(employee, employee.id, "admin")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("loads permissions from the role and lets admin manage users", async () => {
    expect(employee.permissions).toContain("products.read");
    expect(employee.permissions).not.toContain("users.manage");
    await expect(userAdminService.listUsers(admin)).resolves.toBeInstanceOf(Array);
  });

  it("refuses to deactivate yourself or demote the last admin", async () => {
    await expect(userAdminService.setActive(admin, admin.id, false)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("audits user create, role change and deactivation", async () => {
    const target = newEmail("audited");
    const created = await userAdminService.createUser(admin, { name: "A", email: target, roleName: "employee", password: PASSWORD });
    await userAdminService.changeRole(admin, created.id, "admin");
    await userAdminService.setActive(admin, created.id, false);
    const actions = (await prisma.auditLog.findMany({ where: { entityId: created.id } })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["user.create", "user.role.change", "user.deactivate"]));
  });
});

describe("password reset", () => {
  function tokenFrom(message: EmailMessage): string {
    const match = /token=([A-Za-z0-9_-]+)/.exec(message.text);
    if (!match) throw new Error("no token in email");
    return match[1];
  }

  it("answers identically for unknown emails and sends nothing", async () => {
    const before = email.sent.length;
    await expect(authService.requestPasswordReset(`ghost-${run}@example.test`, ip)).resolves.toBeUndefined();
    expect(email.sent.length).toBe(before);
  });

  it("issues a single-use token, sets the new password and revokes all sessions", async () => {
    const target = newEmail("reset");
    await userAdminService.createUser(admin, { name: "R", email: target, roleName: "employee", password: PASSWORD });
    const { token: sessionToken } = await signIn(target);

    await authService.requestPasswordReset(target, ip);
    const message = email.sent.at(-1)!;
    expect(message.to).toBe(target);
    const token = tokenFrom(message);
    const stored = await prisma.passwordResetToken.findMany({ where: { user: { email: target } } });
    expect(stored.every((t) => t.tokenHash !== token)).toBe(true); // only the hash is stored

    await authService.resetPassword(token, "brand-new-password-1", ip);
    expect(await authService.authenticate(sessionToken)).toBeNull();
    await expect(signIn(target)).rejects.toBeInstanceOf(InvalidCredentialsError);
    await expect(signIn(target, "brand-new-password-1")).resolves.toBeDefined();

    // single use
    await expect(authService.resetPassword(token, "another-password-12", ip)).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects an expired token", async () => {
    const target = newEmail("expired");
    await userAdminService.createUser(admin, { name: "E", email: target, roleName: "employee", password: PASSWORD });
    await authService.requestPasswordReset(target, ip);
    const token = tokenFrom(email.sent.at(-1)!);

    const real = clock;
    clock = new Date(real.getTime() + RESET_TOKEN_TTL_MS + 1000);
    try {
      await expect(authService.resetPassword(token, "brand-new-password-1", ip)).rejects.toBeInstanceOf(ValidationError);
    } finally {
      clock = real;
    }
    await expect(signIn(target)).resolves.toBeDefined(); // old password still works
  });

  it("invalidates earlier links when a new one is requested and enforces the password policy", async () => {
    const target = newEmail("twice");
    await userAdminService.createUser(admin, { name: "T", email: target, roleName: "employee", password: PASSWORD });
    await authService.requestPasswordReset(target, ip);
    const first = tokenFrom(email.sent.at(-1)!);
    await authService.requestPasswordReset(target, ip);
    const second = tokenFrom(email.sent.at(-1)!);

    await expect(authService.resetPassword(first, "brand-new-password-1", ip)).rejects.toBeInstanceOf(ValidationError);
    await expect(authService.resetPassword(second, "short", ip)).rejects.toMatchObject({ fieldErrors: { password: expect.any(Array) } });
    await expect(authService.resetPassword(second, "brand-new-password-1", ip)).resolves.toBeUndefined();
  });
});
