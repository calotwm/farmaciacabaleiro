import { prisma } from "@/shared/infrastructure/db/prisma";
import { type DbClient, type TransactionRunner, prismaTransactionRunner } from "@/shared/infrastructure/db/types";
import { createDailyAlerts } from "./application/daily-alerts";
import { type NotificationDispatcher, noopNotificationDispatcher } from "./application/ports";
import { getNotificationDispatcher } from "./dispatcher";
import { PrismaNotifications } from "./infrastructure/prisma-notification-reads";
import { PrismaPushSubscriptions } from "./infrastructure/prisma-push-subscriptions";

export interface AlertsModuleOverrides {
  db?: DbClient;
  transact?: TransactionRunner;
  /** Where Web Push plugs in (default: no external channel). */
  dispatcher?: NotificationDispatcher;
  now?: () => Date;
  onDispatchError?: (error: unknown) => void;
}

/** Composition root of the alerts module (framework-agnostic: usable from scripts and tests). */
export function buildAlertsModule(overrides: AlertsModuleOverrides = {}) {
  const db = overrides.db ?? prisma;
  const dailyAlerts = createDailyAlerts({
    db,
    transact: overrides.transact ?? prismaTransactionRunner(prisma),
    dispatcher: overrides.dispatcher ?? noopNotificationDispatcher,
    now: overrides.now,
    onDispatchError: overrides.onDispatchError,
  });
  return { dailyAlerts, notifications: new PrismaNotifications(db), pushSubscriptions: new PrismaPushSubscriptions(db) };
}

type AlertsModule = ReturnType<typeof buildAlertsModule>;
const globalForAlerts = globalThis as unknown as { alertsModule?: AlertsModule };

/** One instance per process (survives Next.js dev hot reloads). */
export function getAlertsModule(): AlertsModule {
  globalForAlerts.alertsModule ??= buildAlertsModule({ dispatcher: getNotificationDispatcher() });
  return globalForAlerts.alertsModule;
}
