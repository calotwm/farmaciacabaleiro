export type CsvCell = string | number | null | undefined;

/** UTF-8 byte order mark: makes Excel read the file as UTF-8 (accents) instead of ANSI. */
export const CSV_BOM = "﻿";
/** es-AR Excel uses the semicolon as list separator (the comma is the decimal mark). */
export const CSV_SEPARATOR = ";";

const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * One RFC 4180 field. Text starting with = + - @ (or tab / CR) is prefixed with `'` so spreadsheets
 * never evaluate it as a formula; numbers are written as is (a negative quantity stays numeric).
 */
export function escapeCsvCell(cell: CsvCell): string {
  if (cell === null || cell === undefined) return "";
  if (typeof cell === "number") return Number.isFinite(cell) ? String(cell) : "";
  const text = FORMULA_START.test(cell) ? `'${cell}` : cell;
  return /[";\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** BOM + header + rows, `;`-separated, CRLF line breaks (RFC 4180). */
export function toCsv(headers: readonly string[], rows: ReadonlyArray<readonly CsvCell[]>): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCsvCell).join(CSV_SEPARATOR));
  return `${CSV_BOM}${lines.join("\r\n")}\r\n`;
}
