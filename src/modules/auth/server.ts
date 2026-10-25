import { cookies, headers } from "next/headers";
import { cache } from "react";
import { ForbiddenError, UnauthenticatedError } from "@/shared/domain/errors";
import { getAuthModule } from "./composition";
import { type AuthUser, type PermissionKey, hasPermission } from "./domain/permissions";
import { SESSION_ABSOLUTE_MS, SESSION_COOKIE_NAME } from "./domain/session-policy";

/**
 * Server-side auth entry points. Every server action and route handler must call
 * `requireUser()` or `requirePermission(key)`; middleware only checks cookie presence.
 */

export async function getClientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

export async function getUserAgent(): Promise<string | undefined> {
  return (await headers()).get("user-agent") ?? undefined;
}

export async function setSessionCookie(token: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    // The DB row enforces the sliding idle expiry; the cookie only caps the absolute lifetime.
    maxAge: SESSION_ABSOLUTE_MS / 1000,
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE_NAME);
}

export async function getSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE_NAME)?.value;
}

/** The signed-in user, or null. Validated against the DB; memoized per request. */
export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const token = await getSessionToken();
  if (!token) return null;
  return getAuthModule().authService.authenticate(token);
});

export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthenticatedError();
  return user;
}

export async function requirePermission(key: PermissionKey): Promise<AuthUser> {
  const user = await requireUser();
  if (!hasPermission(user, key)) throw new ForbiddenError(key);
  return user;
}
