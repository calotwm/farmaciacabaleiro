import { describe, expect, it, vi } from "vitest";
import { InvalidCredentialsError } from "@/shared/domain/errors";
import { createAuthService } from "./auth-service";
import type { UserRecord, UserRepository } from "./ports";

const record: UserRecord = {
  id: "u1",
  email: "admin@local.invalid",
  name: "Admin",
  active: true,
  roleName: "admin",
  passwordHash: "hash:secret-pass-123",
};

function setup() {
  const users = {
    findByEmail: vi.fn(async (email: string) => (email === record.email ? record : null)),
    findByUsername: vi.fn(async (username: string) => (username === "admin" ? record : null)),
    touchLastLogin: vi.fn(async () => {}),
  } as unknown as UserRepository;
  const attempts = { countRecentFailures: vi.fn(async () => 0) };
  const service = createAuthService({
    users,
    sessions: { deleteExpired: vi.fn(), create: vi.fn() } as never,
    resetTokens: {} as never,
    attempts,
    hasher: { hash: async (v: string) => `hash:${v}`, verify: async (h: string, v: string) => h === `hash:${v}` },
    email: { send: vi.fn() },
    audit: vi.fn(async () => {}),
    appUrl: "http://localhost",
  });
  return { service, users, attempts };
}

describe("login identifier lookup", () => {
  it("looks up by username when the identifier has no @, lowercased and trimmed", async () => {
    const { service, users, attempts } = setup();
    const result = await service.login({ identifier: "  Admin ", password: "secret-pass-123", ip: "ip" });
    expect(result.user.id).toBe("u1");
    expect(users.findByUsername).toHaveBeenCalledWith("admin");
    expect(users.findByEmail).not.toHaveBeenCalled();
    expect(attempts.countRecentFailures).toHaveBeenCalledWith(expect.objectContaining({ email: "admin" }));
  });

  it("looks up by email when the identifier contains @", async () => {
    const { service, users } = setup();
    await service.login({ identifier: "ADMIN@local.invalid", password: "secret-pass-123", ip: "ip" });
    expect(users.findByEmail).toHaveBeenCalledWith("admin@local.invalid");
    expect(users.findByUsername).not.toHaveBeenCalled();
  });

  it("rejects an unknown username with the generic error", async () => {
    const { service } = setup();
    await expect(service.login({ identifier: "nobody", password: "x", ip: "ip" })).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    );
  });
});
