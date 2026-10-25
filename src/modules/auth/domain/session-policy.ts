import { createHash, randomBytes } from "node:crypto";

export const SESSION_COOKIE_NAME = "fc_session";
/** Idle timeout: a session unused for this long expires. Each use slides it forward. */
export const SESSION_IDLE_MS = 12 * 60 * 60 * 1000;
/** Absolute lifetime: a session never outlives this, however active. */
export const SESSION_ABSOLUTE_MS = 7 * 24 * 60 * 60 * 1000;
/** Avoid a DB write on every request: only slide when this much time was gained. */
export const SESSION_REFRESH_THRESHOLD_MS = 5 * 60 * 1000;

/** 32 random bytes, URL-safe. Only its hash is ever stored. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface SessionTimes {
  createdAt: Date;
  /** Current sliding (idle) expiry stored in the DB. */
  expiresAt: Date;
}

/** Sliding expiry for a session used at `now`, capped by the absolute lifetime. */
export function slidingExpiry(createdAt: Date, now: Date): Date {
  const idle = now.getTime() + SESSION_IDLE_MS;
  const absolute = createdAt.getTime() + SESSION_ABSOLUTE_MS;
  return new Date(Math.min(idle, absolute));
}

export function isSessionValid(session: SessionTimes, now: Date): boolean {
  return now.getTime() < session.expiresAt.getTime() && now.getTime() < session.createdAt.getTime() + SESSION_ABSOLUTE_MS;
}

/** The new expiry to persist, or null when the stored one is fresh enough. */
export function nextExpiryIfRefreshNeeded(session: SessionTimes, now: Date): Date | null {
  const candidate = slidingExpiry(session.createdAt, now);
  return candidate.getTime() - session.expiresAt.getTime() >= SESSION_REFRESH_THRESHOLD_MS ? candidate : null;
}
