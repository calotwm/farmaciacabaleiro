import type { NotificationDispatcher } from "@/modules/alerts/application/ports";
import { getNotificationDispatcher } from "@/modules/alerts/dispatcher";
import { recordAudit, type RecordAudit } from "@/modules/audit";
import { prisma } from "@/shared/infrastructure/db/prisma";
import { type DbClient, type TransactionRunner, prismaTransactionRunner } from "@/shared/infrastructure/db/types";
import type { StockLevelAlerts } from "./application/ports";
import { createStockCounts } from "./application/stock-counts";
import { createStockOperations } from "./application/stock-operations";
import { createStockQueries } from "./application/stock-queries";
import { PrismaStockLevelAlerts } from "./infrastructure/prisma-stock-level-alerts";
import { PrismaStockReadRepository } from "./infrastructure/prisma-stock-read-repository";
import { PrismaStockUnitOfWork } from "./infrastructure/prisma-stock-tx";

export interface InventoryModuleOverrides {
  /** Client for reads and post-commit work (default: the shared pool). */
  db?: DbClient;
  /** How a stock operation gets its transaction (default: a real Prisma transaction). */
  transact?: TransactionRunner;
  audit?: RecordAudit;
  /** Replaces the Prisma low-stock alert adapter (tests). */
  alerts?: StockLevelAlerts;
  /** External channel for new low-stock notifications (default: none). */
  dispatcher?: NotificationDispatcher;
  now?: () => Date;
  onAlertError?: (error: unknown) => void;
}

/** Composition root of the inventory module (framework-agnostic: usable from scripts and tests). */
export function buildInventoryModule(overrides: InventoryModuleOverrides = {}) {
  const db = overrides.db ?? prisma;
  const transact = overrides.transact ?? prismaTransactionRunner(prisma);
  const stockLevelAlerts = new PrismaStockLevelAlerts(db, overrides.dispatcher);
  const shared = {
    uow: new PrismaStockUnitOfWork(transact),
    alerts: overrides.alerts ?? stockLevelAlerts,
    audit: overrides.audit ?? recordAudit,
    now: overrides.now,
    onAlertError: overrides.onAlertError,
  };
  const stockOperations = createStockOperations(shared);
  const stockCounts = createStockCounts(shared);
  const stockQueries = createStockQueries({ reads: new PrismaStockReadRepository(db), now: overrides.now });
  return { stockOperations, stockCounts, stockQueries, stockLevelAlerts };
}

type InventoryModule = ReturnType<typeof buildInventoryModule>;
const globalForInventory = globalThis as unknown as { inventoryModule?: InventoryModule };

/** One instance per process (survives Next.js dev hot reloads). */
export function getInventoryModule(): InventoryModule {
  globalForInventory.inventoryModule ??= buildInventoryModule({ dispatcher: getNotificationDispatcher() });
  return globalForInventory.inventoryModule;
}
