import { recordAudit, type RecordAudit } from "@/modules/audit";
import { prisma } from "@/shared/infrastructure/db/prisma";
import type { DbClient } from "@/shared/infrastructure/db/types";
import { createCatalogService } from "./application/catalog-service";
import { createTaxonomyService } from "./application/taxonomy-service";
import { PrismaProductRepository } from "./infrastructure/prisma-product-repository";
import {
  createCategoryRepository,
  createUnitRepository,
  PrismaSupplierLookup,
} from "./infrastructure/prisma-taxonomy-repository";

export interface CatalogModuleOverrides {
  db?: DbClient;
  audit?: RecordAudit;
}

/** Composition root of the catalog module (framework-agnostic: usable from scripts and tests). */
export function buildCatalogModule(overrides: CatalogModuleOverrides = {}) {
  const db = overrides.db ?? prisma;
  const audit = overrides.audit ?? recordAudit;
  const categories = createCategoryRepository(db);
  const units = createUnitRepository(db);
  const catalogService = createCatalogService({
    products: new PrismaProductRepository(db),
    categories,
    units,
    suppliers: new PrismaSupplierLookup(db),
    audit,
  });
  const taxonomyService = createTaxonomyService({ categories, units, audit });
  return { catalogService, taxonomyService };
}

type CatalogModule = ReturnType<typeof buildCatalogModule>;
const globalForCatalog = globalThis as unknown as { catalogModule?: CatalogModule };

/** One instance per process (survives Next.js dev hot reloads). */
export function getCatalogModule(): CatalogModule {
  globalForCatalog.catalogModule ??= buildCatalogModule();
  return globalForCatalog.catalogModule;
}
