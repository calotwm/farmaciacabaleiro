export const DEFAULT_CURRENCY = "ARS";
export const DEFAULT_LOCALE = "es-AR";

/** Anything Decimal-like (Prisma Decimal, decimal.js) exposes toString(). */
export type MoneyInput = string | number | { toString(): string };

export interface MoneyFormatOptions {
  currency?: string;
  locale?: string;
}

const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;

/**
 * Formats an amount, e.g. 1234.5 -> "$ 1.234,50" (es-AR, ARS).
 *
 * Strings and Decimal values are handed to Intl as decimal strings, so no
 * precision is lost to binary floating point.
 */
export function formatMoney(amount: MoneyInput, options: MoneyFormatOptions = {}): string {
  const { currency = DEFAULT_CURRENCY, locale = DEFAULT_LOCALE } = options;
  const normalized = typeof amount === "number" ? amount : amount.toString().trim();
  if (typeof normalized === "number" ? !Number.isFinite(normalized) : !DECIMAL_PATTERN.test(normalized)) {
    throw new RangeError(`Invalid money amount: ${String(amount)}`);
  }
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(normalized as never);
}
