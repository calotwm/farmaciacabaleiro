import { hash, verify } from "@node-rs/argon2";
import type { PasswordHasher } from "../application/ports";

// @node-rs/argon2 defaults to argon2id. Cost profile follows OWASP (19 MiB, 2 iterations, 1 lane).
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export class Argon2PasswordHasher implements PasswordHasher {
  hash(password: string) {
    return hash(password, OPTIONS);
  }

  async verify(passwordHash: string, password: string) {
    try {
      return await verify(passwordHash, password);
    } catch {
      // A malformed stored hash must behave like a wrong password, not a 500.
      return false;
    }
  }
}
