import { prisma } from "@/shared/infrastructure/db/prisma";
import { createRecordAudit } from "./application/record-audit";
import { PrismaAuditWriter } from "./infrastructure/prisma-audit-writer";

export type { AuditEntry, RecordAudit } from "./application/record-audit";

/** Composition root of the audit module: the helper every module uses. */
export const recordAudit = createRecordAudit(new PrismaAuditWriter(prisma));
