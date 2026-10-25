import type { Prisma } from "@/generated/prisma/client";
import { OPEN_DELIVERY_STATUSES } from "@/modules/deliveries/domain/delivery-status";
import { readGeneralSettings } from "@/modules/settings/infrastructure/read-general-settings";
import { type CalendarDate, addDays, fromDbDate, startOfDayInTz, todayInTz, toDbDate } from "@/shared/domain/dates";
import type { DbClient, TransactionRunner } from "@/shared/infrastructure/db/types";
import { type AlertCandidate, alertKey, planDeliveryAlerts, planLotAlerts } from "../domain/plan-alerts";
import { type CreatedNotification, type DailyAlertsResult, type NotificationDispatcher, noopNotificationDispatcher } from "./ports";

export const LAST_RUN_SETTING_KEY = "alerts.lastRunDay";
/** Open deliveries older than this are not announced as late (avoids a flood of ancient history on first run). */
const LATE_LOOKBACK_DAYS = 30;
const UPCOMING_LOOKAHEAD_DAYS = 3;

export interface DailyAlertsDeps {
  /** Client for reads and settings (default wiring: the shared pool). */
  db: DbClient;
  /** Runs events + notifications in one transaction, so a crash never leaves an event without its notifications. */
  transact: TransactionRunner;
  dispatcher?: NotificationDispatcher;
  now?: () => Date;
  onDispatchError?: (error: unknown) => void;
}

export function createDailyAlerts({ db, transact, dispatcher = noopNotificationDispatcher, now = () => new Date(), onDispatchError = console.error }: DailyAlertsDeps) {
  async function collectCandidates(at: Date, today: CalendarDate, thresholds: readonly number[]): Promise<AlertCandidate[]> {
    const widest = Math.max(0, ...thresholds);
    const [lots, deliveries] = await Promise.all([
      db.lot.findMany({
        where: { currentQuantity: { gt: 0 }, expiryDate: { lte: toDbDate(addDays(today, widest)) } },
        select: { id: true, lotNumber: true, expiryDate: true, currentQuantity: true, product: { select: { commercialName: true } } },
      }),
      db.scheduledDelivery.findMany({
        where: {
          status: { in: [...OPEN_DELIVERY_STATUSES] },
          scheduledAt: {
            gte: startOfDayInTz(addDays(today, -LATE_LOOKBACK_DAYS)),
            lt: startOfDayInTz(addDays(today, UPCOMING_LOOKAHEAD_DAYS)),
          },
        },
        select: { id: true, scheduledAt: true, status: true, supplier: { select: { name: true } } },
      }),
    ]);
    return [
      ...planLotAlerts(
        lots.map((lot) => ({
          id: lot.id,
          lotNumber: lot.lotNumber,
          expiryDate: fromDbDate(lot.expiryDate),
          currentQuantity: lot.currentQuantity,
          productName: lot.product.commercialName,
        })),
        today,
        thresholds,
      ),
      ...planDeliveryAlerts(
        deliveries.map((d) => ({ id: d.id, scheduledAt: d.scheduledAt, status: d.status, supplierName: d.supplier.name })),
        at,
      ),
    ];
  }

  /** Evaluates every alert rule once. Safe to run any number of times a day: only NEW events notify. */
  async function runDailyAlerts(at: Date = now()): Promise<DailyAlertsResult> {
    const today = todayInTz(at);
    const settings = await readGeneralSettings(db);
    const candidates = await collectCandidates(at, today, settings.expiryThresholds);
    const events: Record<string, number> = {};
    let created: CreatedNotification[] = [];

    if (candidates.length > 0) {
      const users = await db.user.findMany({ where: { active: true }, select: { id: true } });
      created = await transact(async (tx) => {
        const inserted = await tx.alertEvent.createManyAndReturn({
          data: candidates.map((c) => ({
            rule: c.rule,
            entityType: c.entityType,
            entityId: c.entityId,
            thresholdKey: c.thresholdKey,
            eventDate: toDbDate(c.eventDate),
            payload: c.payload as Prisma.InputJsonObject,
          })),
          skipDuplicates: true,
        });
        const byKey = new Map(candidates.map((c) => [alertKey(c), c]));
        const rows: Prisma.NotificationCreateManyInput[] = [];
        for (const event of inserted) {
          const candidate = byKey.get(alertKey({ ...event, eventDate: fromDbDate(event.eventDate) }));
          if (!candidate) continue;
          events[event.rule] = (events[event.rule] ?? 0) + 1;
          for (const user of users) {
            rows.push({
              userId: user.id,
              alertEventId: event.id,
              title: candidate.title,
              body: candidate.body,
              priority: candidate.priority,
              link: candidate.link,
            });
          }
        }
        if (rows.length === 0) return [];
        return tx.notification.createManyAndReturn({
          data: rows,
          skipDuplicates: true,
          select: { id: true, userId: true, title: true, body: true, priority: true, link: true },
        });
      });
    }

    if (created.length > 0) {
      try {
        await dispatcher.dispatch(created);
      } catch (error) {
        onDispatchError(error);
      }
    }
    await db.setting.upsert({
      where: { key: LAST_RUN_SETTING_KEY },
      create: { key: LAST_RUN_SETTING_KEY, value: today },
      update: { value: today },
    });
    return { day: today, events, notifications: created.length };
  }

  /** Fallback trigger (dashboard load): runs at most once per AR day. Returns null when today already ran. */
  async function runDailyAlertsIfDue(): Promise<DailyAlertsResult | null> {
    const at = now();
    const last = await db.setting.findUnique({ where: { key: LAST_RUN_SETTING_KEY } });
    if (last?.value === todayInTz(at)) return null;
    return runDailyAlerts(at);
  }

  return { runDailyAlerts, runDailyAlertsIfDue };
}

export type DailyAlerts = ReturnType<typeof createDailyAlerts>;
