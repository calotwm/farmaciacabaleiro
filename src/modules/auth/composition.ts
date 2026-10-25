import { recordAudit } from "@/modules/audit";
import { getServerEnv, type ServerEnv } from "@/shared/config/env";
import { prisma } from "@/shared/infrastructure/db/prisma";
import { createAuthService } from "./application/auth-service";
import type { EmailSender } from "./application/ports";
import { createUserAdminService } from "./application/user-admin-service";
import { Argon2PasswordHasher } from "./infrastructure/argon2-password-hasher";
import { ConsoleEmailSender, SmtpEmailSender } from "./infrastructure/email-senders";
import {
  AuditLogLoginAttemptStore,
  PrismaResetTokenRepository,
  PrismaSessionRepository,
  PrismaUserRepository,
} from "./infrastructure/prisma-repositories";

export function createEmailSender(env: ServerEnv): EmailSender {
  if (env.SMTP_HOST && env.SMTP_PORT && env.SMTP_USER && env.SMTP_PASS && env.SMTP_FROM) {
    return new SmtpEmailSender({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
      from: env.SMTP_FROM,
    });
  }
  return new ConsoleEmailSender();
}

export interface AuthModuleOverrides {
  email?: EmailSender;
  now?: () => Date;
}

/** Composition root of the auth module (framework-agnostic: usable from scripts and tests). */
export function buildAuthModule(overrides: AuthModuleOverrides = {}) {
  const env = getServerEnv();
  const users = new PrismaUserRepository(prisma);
  const sessions = new PrismaSessionRepository(prisma);
  const hasher = new Argon2PasswordHasher();

  const authService = createAuthService({
    users,
    sessions,
    resetTokens: new PrismaResetTokenRepository(prisma),
    attempts: new AuditLogLoginAttemptStore(prisma),
    hasher,
    email: overrides.email ?? createEmailSender(env),
    audit: recordAudit,
    appUrl: env.APP_URL,
    now: overrides.now,
  });
  const userAdminService = createUserAdminService({ users, sessions, hasher, audit: recordAudit });
  return { authService, userAdminService };
}

type AuthModule = ReturnType<typeof buildAuthModule>;
const globalForAuth = globalThis as unknown as { authModule?: AuthModule };

/** One instance per process (survives Next.js dev hot reloads). */
export function getAuthModule(): AuthModule {
  globalForAuth.authModule ??= buildAuthModule();
  return globalForAuth.authModule;
}
