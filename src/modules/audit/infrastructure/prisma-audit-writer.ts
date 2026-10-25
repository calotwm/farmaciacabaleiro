import type { PrismaClient } from "@/generated/prisma/client";
import type { AuditEntry, AuditWriter } from "../application/record-audit";

type JsonInput = NonNullable<Parameters<PrismaClient["auditLog"]["create"]>[0]["data"]["after"]>;

function toJson(value: unknown): JsonInput | undefined {
  if (value === undefined || value === null) return undefined;
  // Round trip drops undefined/functions and turns Dates into ISO strings.
  return JSON.parse(JSON.stringify(value)) as JsonInput;
}

export class PrismaAuditWriter implements AuditWriter {
  constructor(private readonly prisma: PrismaClient) {}

  async write(entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorId: entry.actorId ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        before: toJson(entry.before),
        after: toJson(entry.after),
        ip: entry.ip ?? null,
      },
    });
  }
}
