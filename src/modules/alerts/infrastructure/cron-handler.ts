import { createHash, timingSafeEqual } from "node:crypto";
import type { DailyAlertsResult } from "../application/ports";

/** Constant-time check of an `Authorization: Bearer <secret>` header (digests make the lengths equal). */
export function isAuthorizedCron(header: string | null, secret: string): boolean {
  const match = /^Bearer (.+)$/.exec(header ?? "");
  if (!match?.[1]) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(match[1]), digest(secret));
}

export interface CronHandlerDeps {
  /** Read on every call (not cached) so rotating the secret needs no code change. */
  getSecret: () => string | undefined;
  run: () => Promise<DailyAlertsResult>;
}

/** `POST /api/cron/daily`: 503 when no secret is configured, 401 for a missing/wrong one, else runs the alerts. */
export function createCronHandler({ getSecret, run }: CronHandlerDeps) {
  return async function handle(request: Request): Promise<Response> {
    const secret = getSecret();
    if (!secret) return Response.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
    if (!isAuthorizedCron(request.headers.get("authorization"), secret)) {
      return Response.json({ error: "Unauthorized" }, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
    }
    try {
      return Response.json(await run());
    } catch (error) {
      console.error("Daily alerts failed", error);
      return Response.json({ error: "Daily alerts failed" }, { status: 500 });
    }
  };
}
