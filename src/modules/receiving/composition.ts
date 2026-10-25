import type { NotificationDispatcher } from "@/modules/alerts/application/ports";
import { getNotificationDispatcher } from "@/modules/alerts/dispatcher";
import { recordAudit, type RecordAudit } from "@/modules/audit";
import type { StockLevelAlerts } from "@/modules/inventory/application/ports";
import { PrismaStockLevelAlerts } from "@/modules/inventory/infrastructure/prisma-stock-level-alerts";
import { prisma } from "@/shared/infrastructure/db/prisma";
import { type DbClient, type TransactionRunner, prismaTransactionRunner } from "@/shared/infrastructure/db/types";
import type { ReceiptAlerts } from "./application/ports";
import { createReceivingService } from "./application/receiving-service";
import { PrismaReceiptAlerts } from "./infrastructure/prisma-receipt-alerts";
import { PrismaReceivingReadRepository, PrismaReceivingUnitOfWork } from "./infrastructure/prisma-receiving-repository";

export interface ReceivingModuleOverrides {
  /** Client for reads and post-commit work (default: the shared pool). */
  db?: DbClient;
  /** How a confirmation gets its transaction (default: a real Prisma transaction). */
  transact?: TransactionRunner;
  audit?: RecordAudit;
  /** Replace the Prisma adapters of the after-commit notifications (tests inject failing ones). */
  receiptAlerts?: ReceiptAlerts;
  stockAlerts?: StockLevelAlerts;
  /** External channel for the default adapters' new notifications (default: none). */
  dispatcher?: NotificationDispatcher;
  now?: () => Date;
  newIdempotencyKey?: () => string;
  onAlertError?: (error: unknown) => void;
}

/** Composition root of the receiving module (framework-agnostic: usable from scripts, the worker and tests). */
export function buildReceivingModule(overrides: ReceivingModuleOverrides = {}) {
  const db = overrides.db ?? prisma;
  const transact = overrides.transact ?? prismaTransactionRunner(prisma);
  const receivingService = createReceivingService({
    uow: new PrismaReceivingUnitOfWork(transact),
    reads: new PrismaReceivingReadRepository(db),
    receiptAlerts: overrides.receiptAlerts ?? new PrismaReceiptAlerts(db, overrides.dispatcher),
    stockAlerts: overrides.stockAlerts ?? new PrismaStockLevelAlerts(db, overrides.dispatcher),
    audit: overrides.audit ?? recordAudit,
    now: overrides.now,
    newIdempotencyKey: overrides.newIdempotencyKey,
    onAlertError: overrides.onAlertError,
  });
  return { receivingService };
}

type ReceivingModule = ReturnType<typeof buildReceivingModule>;
const globalForReceiving = globalThis as unknown as { receivingModule?: ReceivingModule };

/** One instance per process (survives Next.js dev hot reloads). */
export function getReceivingModule(): ReceivingModule {
  globalForReceiving.receivingModule ??= buildReceivingModule({ dispatcher: getNotificationDispatcher() });
  return globalForReceiving.receivingModule;
}
