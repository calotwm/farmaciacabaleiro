import { type RecordAudit, recordAudit } from "@/modules/audit";
import { prisma } from "@/shared/infrastructure/db/prisma";
import type { DbClient } from "@/shared/infrastructure/db/types";
import { createGeneralSettingsService } from "./application/general-settings-service";

export function buildSettingsModule(overrides: { db?: DbClient; audit?: RecordAudit } = {}) {
  return { generalSettings: createGeneralSettingsService({ db: overrides.db ?? prisma, audit: overrides.audit ?? recordAudit }) };
}

export function getSettingsModule() {
  return buildSettingsModule();
}
