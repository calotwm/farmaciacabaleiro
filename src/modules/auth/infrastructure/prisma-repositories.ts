import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { ConflictError, ValidationError } from "@/shared/domain/errors";
import type {
  LoginAttemptStore,
  ResetTokenRepository,
  SessionRepository,
  StoredSession,
  UserRecord,
  UserRepository,
  UserSummary,
} from "../application/ports";

type UserWithRole = Prisma.UserGetPayload<{ include: { role: true } }>;

function toRecord(user: UserWithRole): UserRecord {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    active: user.active,
    roleName: user.role.name,
    passwordHash: user.passwordHash,
  };
}

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByEmail(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email }, include: { role: true } });
    return user ? toRecord(user) : null;
  }

  async findByUsername(username: string) {
    const user = await this.prisma.user.findUnique({ where: { username }, include: { role: true } });
    return user ? toRecord(user) : null;
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, include: { role: true } });
    return user ? toRecord(user) : null;
  }

  async create(input: { email: string; name: string; passwordHash: string; roleName: string }) {
    const role = await this.prisma.role.findUnique({ where: { name: input.roleName } });
    if (!role) throw new ValidationError("Unknown role", { roleName: ["Elegí un rol válido."] });
    try {
      const user = await this.prisma.user.create({
        data: { email: input.email, name: input.name, passwordHash: input.passwordHash, roleId: role.id },
        include: { role: true },
      });
      return toRecord(user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictError("Email already registered", "Ya existe un usuario con ese email.");
      }
      throw error;
    }
  }

  async list(): Promise<UserSummary[]> {
    const users = await this.prisma.user.findMany({ include: { role: true }, orderBy: [{ active: "desc" }, { name: "asc" }] });
    return users.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      active: user.active,
      roleName: user.role.name,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
    }));
  }

  async listRoleNames() {
    const roles = await this.prisma.role.findMany({ orderBy: { name: "asc" } });
    return roles.map((role) => role.name);
  }

  async updateRole(id: string, roleName: string) {
    await this.prisma.user.update({ where: { id }, data: { role: { connect: { name: roleName } } } });
  }

  async setActive(id: string, active: boolean) {
    await this.prisma.user.update({ where: { id }, data: { active } });
  }

  async updatePasswordHash(id: string, passwordHash: string) {
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
  }

  async touchLastLogin(id: string, at: Date) {
    await this.prisma.user.update({ where: { id }, data: { lastLoginAt: at } });
  }

  countActiveAdmins() {
    return this.prisma.user.count({ where: { active: true, role: { name: "admin" } } });
  }
}

export class PrismaSessionRepository implements SessionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: { userId: string; tokenHash: string; expiresAt: Date; ip?: string; userAgent?: string }) {
    await this.prisma.session.create({
      data: {
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        ip: input.ip,
        userAgent: input.userAgent?.slice(0, 255),
      },
    });
  }

  async findByTokenHash(tokenHash: string): Promise<StoredSession | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash },
      include: { user: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
    });
    if (!session) return null;
    const { user } = session;
    return {
      id: session.id,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        active: user.active,
        roleName: user.role.name,
        permissions: user.role.permissions.map((link) => link.permission.key),
      },
    };
  }

  async updateExpiry(id: string, expiresAt: Date) {
    // updateMany: a concurrent logout may already have removed the row.
    await this.prisma.session.updateMany({ where: { id }, data: { expiresAt } });
  }

  async deleteByTokenHash(tokenHash: string) {
    await this.prisma.session.deleteMany({ where: { tokenHash } });
  }

  async deleteAllForUser(userId: string) {
    await this.prisma.session.deleteMany({ where: { userId } });
  }

  async deleteExpired(now: Date) {
    await this.prisma.session.deleteMany({ where: { expiresAt: { lt: now } } });
  }
}

export class PrismaResetTokenRepository implements ResetTokenRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: { userId: string; tokenHash: string; expiresAt: Date }) {
    await this.prisma.passwordResetToken.create({ data: input });
  }

  async invalidateForUser(userId: string, now: Date) {
    await this.prisma.passwordResetToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: now } });
  }

  consumeAndSetPassword(input: { tokenHash: string; now: Date; passwordHash: string }) {
    return this.prisma.$transaction(async (tx) => {
      const token = await tx.passwordResetToken.findUnique({ where: { tokenHash: input.tokenHash } });
      if (!token || token.usedAt || token.expiresAt <= input.now) return null;
      // Conditional update guarantees single use even under concurrent submissions.
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: token.id, usedAt: null },
        data: { usedAt: input.now },
      });
      if (claimed.count !== 1) return null;
      await tx.user.update({ where: { id: token.userId }, data: { passwordHash: input.passwordHash } });
      await tx.session.deleteMany({ where: { userId: token.userId } });
      return token.userId;
    });
  }
}

/** Rate limiting reads failed-login entries from the audit log (no extra table). */
export class AuditLogLoginAttemptStore implements LoginAttemptStore {
  constructor(private readonly prisma: PrismaClient) {}

  countRecentFailures(input: { email: string; ip: string; since: Date }) {
    return this.prisma.auditLog.count({
      where: {
        action: "auth.login.failed",
        ip: input.ip,
        createdAt: { gte: input.since },
        after: { path: ["email"], equals: input.email },
      },
    });
  }
}
