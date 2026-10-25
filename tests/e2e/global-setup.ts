import { execFileSync } from "node:child_process";
import { join } from "node:path";

const tsx = join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
const fixture = join(process.cwd(), "tests", "e2e", "support", "user-fixture.ts");

const run = (...args: string[]) => execFileSync(process.execPath, [tsx, fixture, ...args], { encoding: "utf8" });

/**
 * Creates a throwaway admin through the app's own services (see support/user-fixture.ts)
 * and exposes its credentials to the test workers via env. The returned function is the teardown.
 */
export default async function globalSetup() {
  const output = run("create").trim().split("\n").at(-1) ?? "";
  const { id, email, password } = JSON.parse(output) as { id: string; email: string; password: string };

  process.env.E2E_EMAIL = email;
  process.env.E2E_PASSWORD = password;

  return async () => {
    run("delete", id, email);
  };
}
