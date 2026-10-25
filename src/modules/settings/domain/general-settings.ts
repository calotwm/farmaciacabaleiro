import { DEFAULT_EXPIRY_THRESHOLDS_DAYS } from "@/shared/domain/expiry-status";

export interface GeneralSettings {
  pharmacyName: string;
  /** Days before expiry that raise an alert, largest first. */
  expiryThresholds: number[];
  defaultMinStock: number;
  /** ISO 4217 code. */
  currency: string;
}

export const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
  pharmacyName: "Farmacia Cabaleiro",
  expiryThresholds: [...DEFAULT_EXPIRY_THRESHOLDS_DAYS],
  defaultMinStock: 0,
  currency: "ARS",
};

/** `Setting.key` of each general value. */
export const GENERAL_SETTING_KEYS = {
  pharmacyName: "general.pharmacyName",
  expiryThresholds: "general.expiryThresholds",
  defaultMinStock: "general.defaultMinStock",
  currency: "general.currency",
} as const;

/** "180, 90, 30" -> [180, 90, 30]: positive integers, unique, largest first. Null when the text is not a valid list. */
export function parseThresholds(text: string): number[] | null {
  const parts = text
    .split(/[,;\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  const values: number[] = [];
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    const value = Number(part);
    if (!Number.isSafeInteger(value) || value < 1 || value > 3650) return null;
    values.push(value);
  }
  return [...new Set(values)].sort((a, b) => b - a);
}

export function formatThresholds(thresholds: readonly number[]): string {
  return thresholds.join(", ");
}

/** Builds the effective settings from raw stored values, falling back to the defaults for anything missing or malformed. */
export function resolveGeneralSettings(raw: Partial<Record<keyof typeof GENERAL_SETTING_KEYS, unknown>>): GeneralSettings {
  const d = DEFAULT_GENERAL_SETTINGS;
  const name = typeof raw.pharmacyName === "string" && raw.pharmacyName.trim() ? raw.pharmacyName.trim() : d.pharmacyName;
  const thresholds =
    Array.isArray(raw.expiryThresholds) && raw.expiryThresholds.length > 0 && raw.expiryThresholds.every((v) => Number.isInteger(v) && v > 0)
      ? [...new Set(raw.expiryThresholds as number[])].sort((a, b) => b - a)
      : [...d.expiryThresholds];
  const minStock = Number.isInteger(raw.defaultMinStock) && (raw.defaultMinStock as number) >= 0 ? (raw.defaultMinStock as number) : d.defaultMinStock;
  const currency = typeof raw.currency === "string" && /^[A-Z]{3}$/.test(raw.currency) ? raw.currency : d.currency;
  return { pharmacyName: name, expiryThresholds: thresholds, defaultMinStock: minStock, currency };
}
