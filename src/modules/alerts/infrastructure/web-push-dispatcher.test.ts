import { describe, expect, it, vi } from "vitest";
import type { DbClient } from "@/shared/infrastructure/db/types";
import type { CreatedNotification } from "../application/ports";
import { MAX_CONSECUTIVE_FAILURES, WebPushDispatcher } from "./web-push-dispatcher";

const notification = (id: string, userId = "u1"): CreatedNotification => ({
  id,
  userId,
  title: "Stock bajo",
  body: "Quedan 2",
  priority: "MEDIUM",
  link: "/productos/p1",
});

function setup(options: { failureCount?: number; sendError?: unknown } = {}) {
  const sub = { id: "s1", userId: "u1", endpoint: "https://push.example/1", p256dh: "k", auth: "a", failureCount: options.failureCount ?? 0 };
  const db = {
    pushSubscription: {
      findMany: vi.fn(async () => [{ ...sub }]),
      update: vi.fn(async () => ({})),
    },
    notificationDelivery: {
      create: vi.fn(async () => ({ id: "d1" })),
      update: vi.fn(async () => ({})),
    },
  };
  const send = vi.fn(async () => {
    if (options.sendError) throw options.sendError;
  });
  const onError = vi.fn();
  const dispatcher = new WebPushDispatcher({ db: db as unknown as DbClient, send, now: () => new Date("2026-01-01T00:00:00Z"), onError });
  return { db, send, onError, dispatcher };
}

describe("WebPushDispatcher", () => {
  it("marks the delivery SENT, sends the payload and resets the failure count", async () => {
    const { db, send, dispatcher } = setup({ failureCount: 3 });
    await dispatcher.dispatch([notification("n1")]);

    expect(db.notificationDelivery.create).toHaveBeenCalledWith({ data: { notificationId: "n1", channel: "PUSH" }, select: { id: true } });
    const payload = JSON.parse((send.mock.calls[0] as unknown[])[1] as string);
    expect(payload).toEqual({ title: "Stock bajo", body: "Quedan 2", url: "/productos/p1", tag: "n1" });
    expect(db.notificationDelivery.update).toHaveBeenCalledWith({ where: { id: "d1" }, data: { status: "SENT", attempts: 1, lastError: null } });
    expect(db.pushSubscription.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { failureCount: 0, lastSuccessAt: new Date("2026-01-01T00:00:00Z") },
    });
  });

  it("disables the subscription on 410 and marks the delivery FAILED", async () => {
    const { db, dispatcher } = setup({ sendError: Object.assign(new Error("gone"), { statusCode: 410 }) });
    await dispatcher.dispatch([notification("n1")]);

    expect(db.pushSubscription.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { failureCount: 1, disabledAt: new Date("2026-01-01T00:00:00Z") },
    });
    expect(db.notificationDelivery.update).toHaveBeenCalledWith({
      where: { id: "d1" },
      data: { status: "FAILED", attempts: 1, lastError: "410: gone" },
    });
  });

  it("counts other failures and disables only at the 5th consecutive one", async () => {
    const error = Object.assign(new Error("boom"), { statusCode: 500 });
    const first = setup({ failureCount: 0, sendError: error });
    await first.dispatcher.dispatch([notification("n1")]);
    expect(first.db.pushSubscription.update).toHaveBeenCalledWith({ where: { id: "s1" }, data: { failureCount: 1 } });

    const last = setup({ failureCount: MAX_CONSECUTIVE_FAILURES - 1, sendError: error });
    await last.dispatcher.dispatch([notification("n1")]);
    expect(last.db.pushSubscription.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { failureCount: MAX_CONSECUTIVE_FAILURES, disabledAt: new Date("2026-01-01T00:00:00Z") },
    });
  });

  it("stops sending to a device it just disabled within the same run", async () => {
    const { send, dispatcher } = setup({ sendError: Object.assign(new Error("gone"), { statusCode: 404 }) });
    await dispatcher.dispatch([notification("n1"), notification("n2")]);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("never throws, even when the database fails", async () => {
    const { db, dispatcher, onError } = setup();
    db.pushSubscription.findMany.mockRejectedValueOnce(new Error("db down"));
    await expect(dispatcher.dispatch([notification("n1")])).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledOnce();

    db.notificationDelivery.create.mockRejectedValueOnce(new Error("insert failed"));
    await expect(dispatcher.dispatch([notification("n2")])).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledTimes(2);
  });
});
