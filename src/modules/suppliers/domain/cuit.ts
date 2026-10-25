/**
 * Argentine CUIT/CUIL: 11 digits, `XX-XXXXXXXX-X`. The last digit is a check digit (modulo 11 over the
 * first ten with weights 5,4,3,2,7,6,5,4,3,2). The database stores the 11 digits without hyphens, so
 * a search by digits matches however the user typed the number.
 */

const WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2] as const;
/** Person (20, 23, 24, 25, 26, 27) and company (30, 33, 34) prefixes issued by AFIP. */
const VALID_PREFIXES = new Set(["20", "23", "24", "25", "26", "27", "30", "33", "34"]);

/** Digits only ("20-12345678-6" -> "20123456786"). */
export function normalizeCuit(input: string): string {
  return input.replace(/\D/g, "");
}

/** The check digit for the first ten digits, or null when none exists (remainder 10: AFIP never issues those). */
export function cuitCheckDigit(firstTen: string): number | null {
  const sum = WEIGHTS.reduce((total, weight, index) => total + weight * Number(firstTen[index]), 0);
  const digit = 11 - (sum % 11);
  if (digit === 11) return 0;
  return digit === 10 ? null : digit;
}

/** True for a well-formed CUIT (separators allowed): 11 digits, known prefix and a matching check digit. */
export function isValidCuit(input: string): boolean {
  if (!/^[\d\s-]+$/.test(input)) return false;
  const digits = normalizeCuit(input);
  if (digits.length !== 11 || !VALID_PREFIXES.has(digits.slice(0, 2))) return false;
  return cuitCheckDigit(digits.slice(0, 10)) === Number(digits[10]);
}

/** "20123456786" -> "20-12345678-6". Anything that is not 11 digits is returned as given. */
export function formatCuit(digits: string): string {
  return /^\d{11}$/.test(digits) ? `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits[10]}` : digits;
}
