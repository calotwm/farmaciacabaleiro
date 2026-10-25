import { recordAudit, type RecordAudit } from "@/modules/audit";
import { prisma } from "@/shared/infrastructure/db/prisma";
import { type DbClient, type TransactionRunner, prismaTransactionRunner } from "@/shared/infrastructure/db/types";
import { createDeliveryService } from "./application/delivery-service";
import { PrismaDeliveryReadRepository, PrismaDeliveryUnitOfWork } from "./infrastructure/prisma-delivery-repository";

export interface DeliveriesModuleOverrides {
  /** Client for reads (default: the shared pool). */
  db?: DbClient;
  /** How a change gets its transaction (default: a real Prisma transaction). */
  transact?: TransactionRunner;
  audit?: RecordAudit;
  now?: () => Date;
}

/** Composition root of the deliveries module (framework-agnostic: usable from scripts, the worker and tests). */
export function buildDeliveriesModule(overrides: DeliveriesModuleOverrides = {}) {
  const db = overrides.db ?? prisma;
  const transact = overrides.transact ?? prismaTransactionRunner(prisma);
  const deliveryService = createDeliveryService({
    uow: new PrismaDeliveryUnitOfWork(transact),
    reads: new PrismaDeliveryReadRepository(db),
    audit: overrides.audit ?? recordAudit,
    now: overrides.now,
  });
  return { deliveryService };
}

type DeliveriesModule = ReturnType<typeof buildDeliveriesModule>;
const globalForDeliveries = globalThis as unknown as { deliveriesModule?: DeliveriesModule };

/** One instance per process (survives Next.js dev hot reloads). */
export function getDeliveriesModule(): DeliveriesModule {
  globalForDeliveries.deliveriesModule ??= buildDeliveriesModule();
  return globalForDeliveries.deliveriesModule;
}
