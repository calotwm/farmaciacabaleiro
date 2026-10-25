import { describe, expect, it } from "vitest";
import {
  SESSION_ABSOLUTE_MS,
  SESSION_IDLE_MS,
  SESSION_REFRESH_THRESHOLD_MS,
  generateToken,
  hashToken,
  isSessionValid,
  nextExpiryIfRefreshNeeded,
  slidingExpiry,
} from "./session-policy";

const T0 = new Date("2026-03-01T12:00:00Z");
const at = (ms: number) => new Date(T0.getTime() + ms);

describe("tokens", () => {
  it("generates 32 random bytes, URL-safe, never repeating", () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).not.toBe(b);
    expect(Buffer.from(a, "base64url")).toHaveLength(32);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("hashes with SHA-256 hex, deterministically, without leaking the token", () => {
    const token = "my-token";
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).not.toContain(token);
    expect(hashToken("other")).not.toBe(hashToken(token));
  });
});

describe("session expiry", () => {
  it("slides by the idle window", () => {
    expect(slidingExpiry(T0, at(60_000)).getTime()).toBe(at(60_000 + SESSION_IDLE_MS).getTime());
  });

  it("never slides beyond the absolute lifetime", () => {
    const lateUse = at(SESSION_ABSOLUTE_MS - 60_000);
    expect(slidingExpiry(T0, lateUse).getTime()).toBe(at(SESSION_ABSOLUTE_MS).getTime());
  });

  it("is valid before the idle expiry and invalid at or after it", () => {
    const session = { createdAt: T0, expiresAt: at(SESSION_IDLE_MS) };
    expect(isSessionValid(session, at(SESSION_IDLE_MS - 1))).toBe(true);
    expect(isSessionValid(session, at(SESSION_IDLE_MS))).toBe(false);
  });

  it("is invalid past the absolute lifetime even if the idle expiry is later", () => {
    const session = { createdAt: T0, expiresAt: at(SESSION_ABSOLUTE_MS + SESSION_IDLE_MS) };
    expect(isSessionValid(session, at(SESSION_ABSOLUTE_MS - 1))).toBe(true);
    expect(isSessionValid(session, at(SESSION_ABSOLUTE_MS))).toBe(false);
  });

  it("skips DB refreshes until enough time passed, then slides", () => {
    const session = { createdAt: T0, expiresAt: at(SESSION_IDLE_MS) };
    expect(nextExpiryIfRefreshNeeded(session, at(SESSION_REFRESH_THRESHOLD_MS - 1))).toBeNull();
    expect(nextExpiryIfRefreshNeeded(session, at(SESSION_REFRESH_THRESHOLD_MS))?.getTime()).toBe(
      at(SESSION_REFRESH_THRESHOLD_MS + SESSION_IDLE_MS).getTime(),
    );
  });

  it("does not refresh once capped by the absolute lifetime", () => {
    const session = { createdAt: T0, expiresAt: at(SESSION_ABSOLUTE_MS) };
    expect(nextExpiryIfRefreshNeeded(session, at(SESSION_ABSOLUTE_MS - 1000))).toBeNull();
  });
});
