import { prisma } from "@/shared/infrastructure/db/prisma";
import type { DbClient } from "@/shared/infrastructure/db/types";
import { PrismaDashboardReads } from "./infrastructure/prisma-dashboard-reads";

export function buildDashboardModule(db: DbClient = prisma) {
  return { reads: new PrismaDashboardReads(db) };
}

export function getDashboardModule() {
  return buildDashboardModule();
}
