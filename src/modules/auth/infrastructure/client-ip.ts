/**
 * Client address for login throttling and audit logs. Railway's edge sets X-Real-IP to the
 * real client; X-Forwarded-For is client-controlled, so it is never trusted.
 */
export function clientIpFrom(headers: Headers): string {
  return headers.get("x-real-ip")?.trim() || "unknown";
}
