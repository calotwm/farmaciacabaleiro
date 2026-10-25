import { describe, expect, it } from "vitest";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, validatePassword } from "./password-policy";

describe("validatePassword", () => {
  it("accepts a password at the minimum length", () => {
    expect(validatePassword("a".repeat(MIN_PASSWORD_LENGTH))).toEqual([]);
  });

  it("rejects passwords shorter than 10 characters", () => {
    expect(validatePassword("a".repeat(MIN_PASSWORD_LENGTH - 1))).toHaveLength(1);
    expect(validatePassword("")).not.toEqual([]);
  });

  it("rejects whitespace-only passwords even when long enough", () => {
    expect(validatePassword(" ".repeat(12))).toContain("La contraseña no puede estar vacía.");
  });

  it("rejects absurdly long passwords", () => {
    expect(validatePassword("a".repeat(MAX_PASSWORD_LENGTH + 1))).toHaveLength(1);
    expect(validatePassword("a".repeat(MAX_PASSWORD_LENGTH))).toEqual([]);
  });

  it("allows passphrases with spaces and unicode", () => {
    expect(validatePassword("contraseña segura ñandú")).toEqual([]);
  });
});
