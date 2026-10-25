import type { Prisma } from "@/generated/prisma/client";

/**
 * What repositories need from Prisma. Both `PrismaClient` and an interactive-transaction
 * client satisfy it, so an adapter can run on the pool or inside a transaction (also a test's
 * rolled-back one).
 */
export type DbClient = Prisma.TransactionClient;

export function isUniqueViolation(error: unknown): boolean {
  return isKnownRequestError(error, "P2002");
}

export function isForeignKeyViolation(error: unknown): boolean {
  return isKnownRequestError(error, "P2003");
}

function isKnownRequestError(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === code;
}
