import type { DbClient } from "@/shared/infrastructure/db/types";
import type { CreatedNotification, NotificationDispatcher } from "../application/ports";

export const MAX_CONSECUTIVE_FAILURES = 5;

export interface PushTarget {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Sends one payload to one device; rejects with an error carrying `statusCode` on HTTP failures (web-push style). */
export type PushSender = (target: PushTarget, payload: string) => Promise<unknown>;

interface Subscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  failureCount: number;
  /** Set during a run so later notifications skip a device that just got disabled. */
  disabled?: boolean;
}

export interface WebPushDispatcherDeps {
  db: DbClient;
  send: PushSender;
  now?: () => Date;
  onError?: (error: unknown) => void;
}

function statusOf(error: unknown): number | undefined {
  const code = typeof error === "object" && error !== null ? (error as { statusCode?: unknown }).statusCode : undefined;
  return typeof code === "number" ? code : undefined;
}

function describeError(error: unknown): string {
  const status = statusOf(error);
  const message = error instanceof Error ? error.message : String(error);
  return (status ? `${status}: ${message}` : message).slice(0, 500);
}

/**
 * Web Push channel. Runs after the notifications are committed and NEVER throws: a push problem must not
 * affect the alert that triggered it (the in-app notification already exists).
 */
export class WebPushDispatcher implements NotificationDispatcher {
  private readonly db: DbClient;
  private readonly send: PushSender;
  private readonly now: () => Date;
  private readonly onError: (error: unknown) => void;

  constructor({ db, send, now = () => new Date(), onError = console.error }: WebPushDispatcherDeps) {
    this.db = db;
    this.send = send;
    this.now = now;
    this.onError = onError;
  }

  async dispatch(notifications: readonly CreatedNotification[]): Promise<void> {
    try {
      const userIds = [...new Set(notifications.map((n) => n.userId))];
      if (userIds.length === 0) return;
      const rows = await this.db.pushSubscription.findMany({
        where: { userId: { in: userIds }, disabledAt: null },
        select: { id: true, userId: true, endpoint: true, p256dh: true, auth: true, failureCount: true },
      });
      const byUser = new Map<string, Subscription[]>();
      for (const row of rows) byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), row]);

      for (const notification of notifications) {
        const subs = (byUser.get(notification.userId) ?? []).filter((s) => !s.disabled);
        if (subs.length === 0) continue;
        try {
          await this.deliver(notification, subs);
        } catch (error) {
          this.onError(error);
        }
      }
    } catch (error) {
      this.onError(error);
    }
  }

  /** Sends a test push to every active device of the user. Never throws. */
  async sendTest(userId: string): Promise<{ sent: number; failed: number }> {
    try {
      const subs: Subscription[] = await this.db.pushSubscription.findMany({
        where: { userId, disabledAt: null },
        select: { id: true, endpoint: true, p256dh: true, auth: true, failureCount: true },
      });
      const payload = JSON.stringify({ title: "Farmacia Cabaleiro", body: "Notificación de prueba.", url: "/configuracion/notificaciones", tag: "test" });
      const results = await Promise.all(subs.map((sub) => this.sendTo(sub, payload)));
      const sent = results.filter((r) => r.ok).length;
      return { sent, failed: results.length - sent };
    } catch (error) {
      this.onError(error);
      return { sent: 0, failed: 0 };
    }
  }

  private async deliver(notification: CreatedNotification, subs: Subscription[]): Promise<void> {
    const delivery = await this.db.notificationDelivery.create({
      data: { notificationId: notification.id, channel: "PUSH" },
      select: { id: true },
    });
    const payload = JSON.stringify({
      title: notification.title,
      body: notification.body,
      url: notification.link ?? "/notificaciones",
      tag: notification.id,
    });
    const results = await Promise.all(subs.map((sub) => this.sendTo(sub, payload)));
    const ok = results.some((r) => r.ok);
    await this.db.notificationDelivery.update({
      where: { id: delivery.id },
      data: { status: ok ? "SENT" : "FAILED", attempts: subs.length, lastError: ok ? null : (results.find((r) => !r.ok)?.error ?? null) },
    });
  }

  /** Sends to one device and updates its health. Never throws. */
  private async sendTo(sub: Subscription, payload: string): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
      await this.send({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
    } catch (error) {
      const gone = statusOf(error) === 404 || statusOf(error) === 410;
      sub.failureCount += 1;
      sub.disabled = gone || sub.failureCount >= MAX_CONSECUTIVE_FAILURES;
      try {
        await this.db.pushSubscription.update({
          where: { id: sub.id },
          data: { failureCount: sub.failureCount, ...(sub.disabled ? { disabledAt: this.now() } : {}) },
        });
      } catch (updateError) {
        this.onError(updateError);
      }
      return { ok: false, error: describeError(error) };
    }
    sub.failureCount = 0;
    try {
      await this.db.pushSubscription.update({ where: { id: sub.id }, data: { failureCount: 0, lastSuccessAt: this.now() } });
    } catch (updateError) {
      this.onError(updateError);
    }
    return { ok: true };
  }
}
