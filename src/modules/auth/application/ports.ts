import type { AuthUser } from "../domain/permissions";

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  active: boolean;
  roleName: string;
  passwordHash: string;
}

export interface UserSummary {
  id: string;
  email: string;
  name: string;
  active: boolean;
  roleName: string;
  lastLoginAt: Date | null;
  createdAt: Date;
}

export interface UserRepository {
  findByEmail(email: string): Promise<UserRecord | null>;
  findByUsername(username: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  /** Throws ConflictError when the email is already taken or RoleNotFound when the role is missing. */
  create(input: { email: string; name: string; passwordHash: string; roleName: string }): Promise<UserRecord>;
  list(): Promise<UserSummary[]>;
  listRoleNames(): Promise<string[]>;
  updateRole(id: string, roleName: string): Promise<void>;
  setActive(id: string, active: boolean): Promise<void>;
  updatePasswordHash(id: string, passwordHash: string): Promise<void>;
  touchLastLogin(id: string, at: Date): Promise<void>;
  countActiveAdmins(): Promise<number>;
}

export interface StoredSession {
  id: string;
  createdAt: Date;
  expiresAt: Date;
  user: AuthUser & { active: boolean };
}

export interface SessionRepository {
  create(input: { userId: string; tokenHash: string; expiresAt: Date; ip?: string; userAgent?: string }): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<StoredSession | null>;
  updateExpiry(id: string, expiresAt: Date): Promise<void>;
  deleteByTokenHash(tokenHash: string): Promise<void>;
  deleteAllForUser(userId: string): Promise<void>;
  deleteExpired(now: Date): Promise<void>;
}

export interface ResetTokenRepository {
  create(input: { userId: string; tokenHash: string; expiresAt: Date }): Promise<void>;
  /** Marks every unused token of the user as used (only the newest link stays valid). */
  invalidateForUser(userId: string, now: Date): Promise<void>;
  /**
   * Atomically: consume a valid unused token, set the new password and revoke all of the
   * user's sessions. Returns the user id, or null when the token is invalid, used or expired.
   */
  consumeAndSetPassword(input: { tokenHash: string; now: Date; passwordHash: string }): Promise<string | null>;
}

export interface LoginAttemptStore {
  countRecentFailures(input: { email: string; ip: string; since: Date }): Promise<number>;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}
