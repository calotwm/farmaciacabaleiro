import type { DbClient } from "@/shared/infrastructure/db/types";

export interface PushSubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
}

export interface PushDevice {
  id: string;
  endpoint: string;
  userAgent: string | null;
  createdAt: Date;
  disabledAt: Date | null;
}

/** Push device subscriptions, always scoped to one user: another user's devices are never read or removed. */
export class PrismaPushSubscriptions {
  constructor(private readonly db: DbClient) {}

  /** One row per endpoint. A browser that logs in as another user moves its subscription to that user. */
  async upsert(userId: string, input: PushSubscriptionInput): Promise<void> {
    const data = { userId, p256dh: input.p256dh, auth: input.auth, userAgent: input.userAgent ?? null };
    await this.db.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      create: { endpoint: input.endpoint, ...data },
      update: { ...data, failureCount: 0, disabledAt: null },
    });
  }

  async removeByEndpoint(userId: string, endpoint: string): Promise<void> {
    await this.db.pushSubscription.deleteMany({ where: { userId, endpoint } });
  }

  async removeById(userId: string, id: string): Promise<void> {
    await this.db.pushSubscription.deleteMany({ where: { userId, id } });
  }

  list(userId: string): Promise<PushDevice[]> {
    return this.db.pushSubscription.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { id: true, endpoint: true, userAgent: true, createdAt: true, disabledAt: true },
    });
  }
}
