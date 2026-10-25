import { recordAudit, type RecordAudit } from "@/modules/audit";
import { prisma } from "@/shared/infrastructure/db/prisma";
import type { DbClient } from "@/shared/infrastructure/db/types";
import { createSupplierService } from "./application/supplier-service";
import { PrismaSupplierRepository } from "./infrastructure/prisma-supplier-repository";

export interface SuppliersModuleOverrides {
  db?: DbClient;
  audit?: RecordAudit;
}

/** Composition root of the suppliers module (framework-agnostic: usable from scripts and tests). */
export function buildSuppliersModule(overrides: SuppliersModuleOverrides = {}) {
  const db = overrides.db ?? prisma;
  const supplierService = createSupplierService({
    suppliers: new PrismaSupplierRepository(db),
    audit: overrides.audit ?? recordAudit,
  });
  return { supplierService };
}

type SuppliersModule = ReturnType<typeof buildSuppliersModule>;
const globalForSuppliers = globalThis as unknown as { suppliersModule?: SuppliersModule };

/** One instance per process (survives Next.js dev hot reloads). */
export function getSuppliersModule(): SuppliersModule {
  globalForSuppliers.suppliersModule ??= buildSuppliersModule();
  return globalForSuppliers.suppliersModule;
}
