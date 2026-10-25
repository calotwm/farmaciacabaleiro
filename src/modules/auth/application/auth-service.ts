import type { RecordAudit } from "@/modules/audit/application/record-audit";
import { InvalidCredentialsError, RateLimitError, ValidationError } from "@/shared/domain/errors";
import type { AuthUser } from "../domain/permissions";
import { validatePassword } from "../domain/password-policy";
import {
  generateToken,
  hashToken,
  isSessionValid,
  nextExpiryIfRefreshNeeded,
  slidingExpiry,
} from "../domain/session-policy";
import type {
  EmailSender,
  LoginAttemptStore,
  PasswordHasher,
  ResetTokenRepository,
  SessionRepository,
  UserRepository,
} from "./ports";

export const MAX_FAILED_LOGINS = 5;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

export interface AuthServiceDeps {
  users: UserRepository;
  sessions: SessionRepository;
  resetTokens: ResetTokenRepository;
  attempts: LoginAttemptStore;
  hasher: PasswordHasher;
  email: EmailSender;
  audit: RecordAudit;
  appUrl: string;
  now?: () => Date;
}

export interface LoginInput {
  email: string;
  password: string;
  ip: string;
  userAgent?: string;
}

export interface LoginResult {
  token: string;
  expiresAt: Date;
  user: { id: string; email: string; name: string };
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export function createAuthService(deps: AuthServiceDeps) {
  const { users, sessions, resetTokens, attempts, hasher, email, audit, appUrl } = deps;
  const now = deps.now ?? (() => new Date());
  // Verified against when the email is unknown so response time does not reveal accounts.
  let dummyHash: Promise<string> | undefined;

  async function login(input: LoginInput): Promise<LoginResult> {
    const address = normalizeEmail(input.email);
    const current = now();

    const failures = await attempts.countRecentFailures({
      email: address,
      ip: input.ip,
      since: new Date(current.getTime() - LOGIN_WINDOW_MS),
    });
    if (failures >= MAX_FAILED_LOGINS) {
      await audit({ action: "auth.login.blocked", entityType: "auth", after: { email: address }, ip: input.ip });
      throw new RateLimitError("Too many failed login attempts");
    }

    const user = await users.findByEmail(address);
    dummyHash ??= hasher.hash("timing-equalizer-password");
    const passwordOk = await hasher.verify(user?.passwordHash ?? (await dummyHash), input.password);

    if (!user || !passwordOk || !user.active) {
      const reason = !user ? "unknown_user" : !passwordOk ? "bad_password" : "inactive_user";
      await audit({
        actorId: user?.id ?? null,
        action: "auth.login.failed",
        entityType: "auth",
        after: { email: address, reason },
        ip: input.ip,
      });
      throw new InvalidCredentialsError();
    }

    const token = generateToken();
    const expiresAt = slidingExpiry(current, current);
    await sessions.deleteExpired(current);
    await sessions.create({
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt,
      ip: input.ip,
      userAgent: input.userAgent,
    });
    await users.touchLastLogin(user.id, current);
    await audit({
      actorId: user.id,
      action: "auth.login.success",
      entityType: "user",
      entityId: user.id,
      ip: input.ip,
    });
    return { token, expiresAt, user: { id: user.id, email: user.email, name: user.name } };
  }

  async function logout(token: string, actor?: { id: string }, ip?: string): Promise<void> {
    await sessions.deleteByTokenHash(hashToken(token));
    if (actor) {
      await audit({ actorId: actor.id, action: "auth.logout", entityType: "user", entityId: actor.id, ip });
    }
  }

  /** Resolves a session cookie token to the signed-in user, sliding the idle expiry. */
  async function authenticate(token: string): Promise<AuthUser | null> {
    const tokenHash = hashToken(token);
    const stored = await sessions.findByTokenHash(tokenHash);
    if (!stored) return null;

    const current = now();
    if (!isSessionValid(stored, current) || !stored.user.active) {
      await sessions.deleteByTokenHash(tokenHash);
      return null;
    }
    const refreshed = nextExpiryIfRefreshNeeded(stored, current);
    if (refreshed) await sessions.updateExpiry(stored.id, refreshed);

    const { id, email: address, name, roleName, permissions } = stored.user;
    return { id, email: address, name, roleName, permissions };
  }

  /** Always resolves the same way, whether or not the email belongs to an account. */
  async function requestPasswordReset(emailInput: string, ip?: string): Promise<void> {
    const address = normalizeEmail(emailInput);
    const user = await users.findByEmail(address);
    if (!user || !user.active) return;

    const current = now();
    const token = generateToken();
    await resetTokens.invalidateForUser(user.id, current);
    await resetTokens.create({
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(current.getTime() + RESET_TOKEN_TTL_MS),
    });
    await audit({
      actorId: user.id,
      action: "auth.password_reset.requested",
      entityType: "user",
      entityId: user.id,
      ip,
    });

    const link = `${appUrl.replace(/\/$/, "")}/restablecer?token=${token}`;
    try {
      await email.send({
        to: user.email,
        subject: "Restablecer tu contraseña - Farmacia Cabaleiro",
        text:
          `Hola ${user.name},\n\nPara elegir una nueva contraseña ingresá al siguiente enlace ` +
          `(vence en 1 hora y solo puede usarse una vez):\n\n${link}\n\n` +
          "Si no lo pediste vos, ignorá este mensaje.",
      });
    } catch (error) {
      // Never reveal delivery problems to the requester (that would expose the account).
      console.error("Failed to send password reset email", error);
    }
  }

  async function resetPassword(token: string, newPassword: string, ip?: string): Promise<void> {
    const problems = validatePassword(newPassword);
    if (problems.length > 0) throw new ValidationError("Weak password", { password: problems });

    const passwordHash = await hasher.hash(newPassword);
    const userId = await resetTokens.consumeAndSetPassword({ tokenHash: hashToken(token), now: now(), passwordHash });
    if (!userId) {
      throw new ValidationError("Invalid or expired reset token", {}, "El enlace no es válido o ya venció. Pedí uno nuevo.");
    }
    await audit({
      actorId: userId,
      action: "auth.password_reset.completed",
      entityType: "user",
      entityId: userId,
      ip,
    });
  }

  return { login, logout, authenticate, requestPasswordReset, resetPassword };
}

export type AuthService = ReturnType<typeof createAuthService>;
