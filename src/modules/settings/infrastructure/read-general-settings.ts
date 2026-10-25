import type { DbClient } from "@/shared/infrastructure/db/types";
import { GENERAL_SETTING_KEYS, type GeneralSettings, resolveGeneralSettings } from "../domain/general-settings";

/** The effective general settings (stored values over defaults). */
export async function readGeneralSettings(db: DbClient): Promise<GeneralSettings> {
  const rows = await db.setting.findMany({ where: { key: { in: Object.values(GENERAL_SETTING_KEYS) } } });
  const byKey = new Map(rows.map((row) => [row.key, row.value]));
  return resolveGeneralSettings({
    pharmacyName: byKey.get(GENERAL_SETTING_KEYS.pharmacyName),
    expiryThresholds: byKey.get(GENERAL_SETTING_KEYS.expiryThresholds),
    defaultMinStock: byKey.get(GENERAL_SETTING_KEYS.defaultMinStock),
    currency: byKey.get(GENERAL_SETTING_KEYS.currency),
  });
}
