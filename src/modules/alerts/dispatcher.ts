import webpush from "web-push";
import { getServerEnv, isWebPushConfigured } from "@/shared/config/env";
import { prisma } from "@/shared/infrastructure/db/prisma";
import { type NotificationDispatcher, noopNotificationDispatcher } from "./application/ports";
import { type PushSender, WebPushDispatcher } from "./infrastructure/web-push-dispatcher";

const TTL_SECONDS = 24 * 60 * 60;

const globalForPush = globalThis as unknown as { webPushDispatcher?: WebPushDispatcher | null };

/** The Web Push dispatcher, or null when VAPID is not configured. One instance per process. */
export function getWebPushDispatcher(): WebPushDispatcher | null {
  if (globalForPush.webPushDispatcher !== undefined) return globalForPush.webPushDispatcher;
  const env = getServerEnv();
  if (!isWebPushConfigured(env)) return (globalForPush.webPushDispatcher = null);
  const details = { subject: env.VAPID_SUBJECT as string, publicKey: env.VAPID_PUBLIC_KEY as string, privateKey: env.VAPID_PRIVATE_KEY as string };
  const send: PushSender = (target, payload) =>
    webpush.sendNotification(target, payload, {
      TTL: TTL_SECONDS,
      vapidDetails: details,
    });
  return (globalForPush.webPushDispatcher = new WebPushDispatcher({ db: prisma, send }));
}

/** What the post-commit alert code should call: push when configured, nothing otherwise. */
export function getNotificationDispatcher(): NotificationDispatcher {
  return getWebPushDispatcher() ?? noopNotificationDispatcher;
}
