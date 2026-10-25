import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../generated/prisma/client";

/**
 * Builds a Prisma client over node-postgres.
 *
 * Set DATABASE_SSL_REJECT_UNAUTHORIZED=false only for providers that expose a
 * self-signed certificate on a public proxy (e.g. the Railway dev database).
 * Production must keep certificate verification on.
 */
export function createPrismaClient(env: NodeJS.ProcessEnv = process.env): PrismaClient {
  const connectionString = env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  if (env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false") {
    return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  }
  // A URL-level sslmode takes precedence over the ssl option in node-postgres, so drop it.
  const url = new URL(connectionString);
  url.searchParams.delete("sslmode");
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: url.toString(), ssl: { rejectUnauthorized: false } }),
  });
}
