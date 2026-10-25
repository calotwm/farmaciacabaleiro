import type { Prisma, PrismaClient } from "@/generated/prisma/client";

/**
 * What repositories need from Prisma. Both `PrismaClient` and an interactive-transaction
 * client satisfy it, so an adapter can run on the pool or inside a transaction (also a test's
 * rolled-back one).
 */
export type DbClient = Prisma.TransactionClient;

/** Runs `work` in one database transaction. Tests inject one that reuses an outer, rolled-back transaction. */
export type TransactionRunner = <T>(work: (tx: DbClient) => Promise<T>) => Promise<T>;

/** Interactive transactions with room for a remote database (several round trips per operation). */
export function prismaTransactionRunner(prisma: PrismaClient): TransactionRunner {
  return (work) => prisma.$transaction(work, { timeout: 30_000, maxWait: 10_000 });
}

export function isUniqueViolation(error: unknown): boolean {
  return isKnownRequestError(error, "P2002");
}

export function isForeignKeyViolation(error: unknown): boolean {
  return isKnownRequestError(error, "P2003");
}

function isKnownRequestError(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === code;
}
