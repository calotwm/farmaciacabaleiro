import { describe, expect, it, vi } from "vitest";
import type { DbClient } from "@/shared/infrastructure/db/types";
import { PrismaPushSubscriptions } from "./prisma-push-subscriptions";

function setup() {
  const pushSubscription = { upsert: vi.fn(async () => ({})), deleteMany: vi.fn(async () => ({ count: 1 })), findMany: vi.fn(async () => []) };
  return { pushSubscription, repo: new PrismaPushSubscriptions({ pushSubscription } as unknown as DbClient) };
}

describe("PrismaPushSubscriptions", () => {
  it("upserts by endpoint for the given user and re-enables the device", async () => {
    const { pushSubscription, repo } = setup();
    await repo.upsert("u1", { endpoint: "https://push.example/1", p256dh: "k", auth: "a", userAgent: "UA" });
    expect(pushSubscription.upsert).toHaveBeenCalledWith({
      where: { endpoint: "https://push.example/1" },
      create: { endpoint: "https://push.example/1", userId: "u1", p256dh: "k", auth: "a", userAgent: "UA" },
      update: { userId: "u1", p256dh: "k", auth: "a", userAgent: "UA", failureCount: 0, disabledAt: null },
    });
  });

  it("scopes removal and listing to the user", async () => {
    const { pushSubscription, repo } = setup();
    await repo.removeByEndpoint("u1", "https://push.example/1");
    await repo.removeById("u1", "id1");
    await repo.list("u1");
    expect(pushSubscription.deleteMany).toHaveBeenNthCalledWith(1, { where: { userId: "u1", endpoint: "https://push.example/1" } });
    expect(pushSubscription.deleteMany).toHaveBeenNthCalledWith(2, { where: { userId: "u1", id: "id1" } });
    expect(pushSubscription.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "u1" } }));
  });
});
