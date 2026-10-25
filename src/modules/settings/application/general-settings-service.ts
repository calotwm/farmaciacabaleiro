import type { RecordAudit } from "@/modules/audit";
import { type AuthUser, assertPermission } from "@/modules/auth/domain/permissions";
import type { DbClient } from "@/shared/infrastructure/db/types";
import { GENERAL_SETTING_KEYS, type GeneralSettings } from "../domain/general-settings";
import { readGeneralSettings } from "../infrastructure/read-general-settings";

export interface GeneralSettingsDeps {
  db: DbClient;
  audit: RecordAudit;
}

export function createGeneralSettingsService({ db, audit }: GeneralSettingsDeps) {
  return {
    get: () => readGeneralSettings(db),

    /** Saves all four values (admin only: `settings.manage`). */
    async update(actor: AuthUser, input: GeneralSettings, ip?: string): Promise<GeneralSettings> {
      assertPermission(actor, "settings.manage");
      const before = await readGeneralSettings(db);
      const values: Record<keyof typeof GENERAL_SETTING_KEYS, unknown> = {
        pharmacyName: input.pharmacyName,
        expiryThresholds: [...input.expiryThresholds].sort((a, b) => b - a),
        defaultMinStock: input.defaultMinStock,
        currency: input.currency,
      };
      for (const name of Object.keys(GENERAL_SETTING_KEYS) as (keyof typeof GENERAL_SETTING_KEYS)[]) {
        const key = GENERAL_SETTING_KEYS[name];
        const value = values[name] as never;
        await db.setting.upsert({ where: { key }, create: { key, value, updatedById: actor.id }, update: { value, updatedById: actor.id } });
      }
      const after = await readGeneralSettings(db);
      await audit({ actorId: actor.id, action: "settings.update", entityType: "settings", before, after, ip });
      return after;
    },
  };
}
