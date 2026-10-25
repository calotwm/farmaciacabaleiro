import "dotenv/config";
/**
 * Daily alerts (real database, rolled-back transaction) and the cron endpoint's authentication.
 * The authorized cron path is exercised with a fake runner so no real alerts are committed.
 */
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { buildAlertsModule } from "@/modules/alerts/composition";
import { createCronHandler } from "@/modules/alerts/infrastructure/cron-handler";
import { POST } from "@/app/api/cron/daily/route";
import { addDays, todayInTz, toDbDate, zonedInstant } from "@/shared/domain/dates";
import { prisma } from "@/shared/infrastructure/db/prisma";
import { createActiveUser, inRolledBackTransaction, seededCategoryAndUnit } from "./support/fixtures";

const TODAY = todayInTz();

afterAll(async () => {
  await prisma.$disconnect();
});

describe("runDailyAlerts", () => {
  it("raises each alert once and a rerun creates nothing", async () => {
    await inRolledBackTransaction(async (tx) => {
      const user = await createActiveUser(tx, "admin");
      const { categoryId, unitId } = await seededCategoryAndUnit(tx);
      const product = await tx.product.create({ data: { code: `TEST-${crypto.randomUUID()}`, commercialName: "TEST alertas", categoryId, unitId } });
      const lot = (expiry: string) =>
        tx.lot.create({
          data: { productId: product.id, lotNumber: `L-${crypto.randomUUID()}`, expiryDate: toDbDate(expiry), initialQuantity: 5, currentQuantity: 5 },
        });
      const crossing = await lot(addDays(TODAY, 20)); // default thresholds: crosses 30
      const expired = await lot(addDays(TODAY, -3));
      const supplier = await tx.supplier.create({ data: { name: `TEST proveedor ${crypto.randomUUID()}` } });
      const delivery = (scheduledAt: Date) => tx.scheduledDelivery.create({ data: { supplierId: supplier.id, scheduledAt } });
      const upcoming = await delivery(zonedInstant(addDays(TODAY, 1), "10:00")); // reminder "days-before-1" is due today
      const late = await delivery(zonedInstant(addDays(TODAY, -1), "10:00"));

      const { dailyAlerts } = buildAlertsModule({ db: tx, transact: (work) => work(tx) });
      const mine = { entityId: { in: [crossing.id, expired.id, upcoming.id, late.id] } };
      const notificationsOfUser = () => tx.notification.count({ where: { userId: user.id, alertEvent: mine } });

      const first = await dailyAlerts.runDailyAlerts();
      const events = await tx.alertEvent.findMany({ where: mine, orderBy: { rule: "asc" } });
      expect(events.map((e) => [e.rule, e.entityId, e.thresholdKey]).sort()).toEqual(
        [
          ["LOT_EXPIRY_THRESHOLD", crossing.id, "30"],
          ["LOT_EXPIRED_WITH_STOCK", expired.id, ""],
          ["DELIVERY_UPCOMING", upcoming.id, "days-before-1"],
          ["DELIVERY_LATE", late.id, ""],
        ].sort(),
      );
      expect(await notificationsOfUser()).toBe(4);
      expect(first.notifications).toBeGreaterThanOrEqual(4);
      const links = (await tx.notification.findMany({ where: { userId: user.id, alertEvent: mine } })).map((n) => n.link).sort();
      expect(links).toEqual([`/entregas/${late.id}`, `/entregas/${upcoming.id}`, `/lotes/${crossing.id}`, `/lotes/${expired.id}`].sort());

      const second = await dailyAlerts.runDailyAlerts();
      expect(second.notifications).toBe(0);
      expect(Object.values(second.events).reduce((a, b) => a + b, 0)).toBe(0);
      expect(await tx.alertEvent.count({ where: mine })).toBe(4);
      expect(await notificationsOfUser()).toBe(4);

      // Recorded once per AR day: the fallback does nothing after a run.
      expect((await tx.setting.findUniqueOrThrow({ where: { key: "alerts.lastRunDay" } })).value).toBe(TODAY);
      expect(await dailyAlerts.runDailyAlertsIfDue()).toBeNull();
    });
  });
});

describe("POST /api/cron/daily authentication", () => {
  const original = process.env.CRON_SECRET;
  afterEach(() => {
    if (original === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = original;
  });
  const call = (headers: Record<string, string> = {}) => POST(new Request("http://localhost/api/cron/daily", { method: "POST", headers }));

  it("answers 503 when no secret is configured", async () => {
    delete process.env.CRON_SECRET;
    expect((await call({ authorization: "Bearer anything" })).status).toBe(503);
  });

  it("answers 401 without a header or with a wrong secret", async () => {
    process.env.CRON_SECRET = "correct-secret-value";
    expect((await call()).status).toBe(401);
    expect((await call({ authorization: "Bearer wrong-secret-value" })).status).toBe(401);
    expect((await call({ authorization: "correct-secret-value" })).status).toBe(401);
  });

  it("runs the alerts and returns the counts for the right secret", async () => {
    const handler = createCronHandler({
      getSecret: () => "correct-secret-value",
      run: async () => ({ day: TODAY, events: { DELIVERY_LATE: 1 }, notifications: 2 }),
    });
    const response = await handler(new Request("http://localhost/api/cron/daily", { method: "POST", headers: { authorization: "Bearer correct-secret-value" } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ day: TODAY, events: { DELIVERY_LATE: 1 }, notifications: 2 });
  });
});
