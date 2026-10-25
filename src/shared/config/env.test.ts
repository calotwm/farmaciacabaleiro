import { describe, expect, it } from "vitest";
import { EnvValidationError, isSmtpConfigured, parseServerEnv } from "./env";

const base = { DATABASE_URL: "postgresql://user:pass@localhost:5432/db" };

describe("parseServerEnv", () => {
  it("accepts a minimal environment and applies defaults", () => {
    const env = parseServerEnv(base);
    expect(env.APP_URL).toBe("http://localhost:3000");
    expect(env.NODE_ENV).toBe("development");
    expect(isSmtpConfigured(env)).toBe(false);
  });

  it("fails fast with a clear message when DATABASE_URL is missing", () => {
    expect(() => parseServerEnv({})).toThrow(EnvValidationError);
    expect(() => parseServerEnv({})).toThrow(/DATABASE_URL/);
  });

  it("treats empty strings as unset", () => {
    const env = parseServerEnv({ ...base, SMTP_HOST: "", SESSION_SECRET: "", APP_URL: "" });
    expect(env.SMTP_HOST).toBeUndefined();
    expect(env.APP_URL).toBe("http://localhost:3000");
  });

  it("requires SMTP settings to be complete", () => {
    expect(() => parseServerEnv({ ...base, SMTP_HOST: "smtp.example.test" })).toThrow(/SMTP_PORT/);
    const env = parseServerEnv({
      ...base,
      SMTP_HOST: "smtp.example.test",
      SMTP_PORT: "587",
      SMTP_USER: "u",
      SMTP_PASS: "p",
      SMTP_FROM: "Farmacia <no-reply@example.test>",
    });
    expect(env.SMTP_PORT).toBe(587);
    expect(isSmtpConfigured(env)).toBe(true);
  });

  it("requires VAPID keys together", () => {
    expect(() => parseServerEnv({ ...base, VAPID_PUBLIC_KEY: "pub" })).toThrow(/VAPID_PRIVATE_KEY/);
  });

  it("rejects short session secrets and invalid URLs", () => {
    expect(() => parseServerEnv({ ...base, SESSION_SECRET: "short" })).toThrow(/SESSION_SECRET/);
    expect(() => parseServerEnv({ ...base, APP_URL: "not a url" })).toThrow(/APP_URL/);
  });
});
