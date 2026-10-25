import "dotenv/config";
/** Push subscription repository against the real database (rolled-back transaction). */
import { afterAll, describe, expect, it } from "vitest";
import { PrismaPushSubscriptions } from "@/modules/alerts/infrastructure/prisma-push-subscriptions";
import { prisma } from "@/shared/infrastructure/db/prisma";
import { createActiveUser, inRolledBackTransaction } from "./support/fixtures";

afterAll(async () => {
  await prisma.$disconnect();
});

describe("PrismaPushSubscriptions", () => {
  it("upserts per endpoint, supports several devices and only removes the owner's rows", async () => {
    await inRolledBackTransaction(async (tx) => {
      const a = await createActiveUser(tx, "admin");
      const b = await createActiveUser(tx, "employee");
      const repo = new PrismaPushSubscriptions(tx);
      const endpoint = `https://push.example.test/${crypto.randomUUID()}`;

      await repo.upsert(a.id, { endpoint, p256dh: "k1", auth: "a1", userAgent: "UA1" });
      await repo.upsert(a.id, { endpoint, p256dh: "k2", auth: "a2", userAgent: "UA1" });
      await repo.upsert(a.id, { endpoint: `${endpoint}-2`, p256dh: "k", auth: "a" });
      const devices = await repo.list(a.id);
      expect(devices).toHaveLength(2);
      expect(await tx.pushSubscription.findUniqueOrThrow({ where: { endpoint } })).toMatchObject({ p256dh: "k2", auth: "a2" });

      await repo.removeByEndpoint(b.id, endpoint); // not b's: nothing happens
      expect(await repo.list(a.id)).toHaveLength(2);

      await repo.removeByEndpoint(a.id, endpoint);
      const left = await repo.list(a.id);
      expect(left.map((d) => d.endpoint)).toEqual([`${endpoint}-2`]);

      await repo.removeById(b.id, left[0]!.id); // not b's
      expect(await repo.list(a.id)).toHaveLength(1);
      await repo.removeById(a.id, left[0]!.id);
      expect(await repo.list(a.id)).toHaveLength(0);
    });
  });
});
