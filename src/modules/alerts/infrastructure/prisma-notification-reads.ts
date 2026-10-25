import type { DbClient } from "@/shared/infrastructure/db/types";

const select = { id: true, title: true, body: true, priority: true, link: true, readAt: true, createdAt: true } as const;

export type NotificationItem = {
  id: string;
  title: string;
  body: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
};

/** Notification reads and writes, always scoped to one user: another user's rows are never touched. */
export class PrismaNotifications {
  constructor(private readonly db: DbClient) {}

  unreadCount(userId: string): Promise<number> {
    return this.db.notification.count({ where: { userId, readAt: null } });
  }

  latest(userId: string, take: number): Promise<NotificationItem[]> {
    return this.db.notification.findMany({ where: { userId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take, select });
  }

  async page(userId: string, page: number, pageSize: number): Promise<{ items: NotificationItem[]; total: number }> {
    const [total, items] = await Promise.all([
      this.db.notification.count({ where: { userId } }),
      this.db.notification.findMany({
        where: { userId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select,
      }),
    ]);
    return { items, total };
  }

  async markRead(userId: string, id: string, at: Date = new Date()): Promise<void> {
    await this.db.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: at } });
  }

  async markAllRead(userId: string, at: Date = new Date()): Promise<number> {
    const result = await this.db.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: at } });
    return result.count;
  }
}
