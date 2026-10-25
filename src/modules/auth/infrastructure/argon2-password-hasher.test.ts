import { describe, expect, it } from "vitest";
import { Argon2PasswordHasher } from "./argon2-password-hasher";

describe("Argon2PasswordHasher", () => {
  const hasher = new Argon2PasswordHasher();

  it("produces argon2id hashes that verify only the right password", async () => {
    const hash = await hasher.hash("correct horse battery");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(hash).not.toContain("correct horse battery");
    expect(await hasher.verify(hash, "correct horse battery")).toBe(true);
    expect(await hasher.verify(hash, "wrong password!!")).toBe(false);
  });

  it("salts every hash", async () => {
    expect(await hasher.hash("same-password-1")).not.toBe(await hasher.hash("same-password-1"));
  });

  it("treats a malformed stored hash as a failed verification", async () => {
    expect(await hasher.verify("not-a-hash", "whatever-password")).toBe(false);
  });
});
