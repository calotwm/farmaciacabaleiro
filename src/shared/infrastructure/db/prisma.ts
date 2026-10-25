import type { PrismaClient } from "@/generated/prisma/client";
import { createPrismaClient } from "./create-client";

// Reuse one client across Next.js dev hot reloads to avoid exhausting connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
