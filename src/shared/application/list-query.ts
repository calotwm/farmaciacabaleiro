/** Helpers for server-side tables driven by URL search params (search, filters, sort, pagination). */

export const DEFAULT_PAGE_SIZE = 20;

export type SearchParams = Record<string, string | string[] | undefined>;
export type SortDirection = "asc" | "desc";

/** First value of a search param (Next.js gives arrays for repeated keys). */
export function firstParam(value: string | string[] | undefined): string | undefined {
  const single = Array.isArray(value) ? value[0] : value;
  const trimmed = single?.trim();
  return trimmed ? trimmed : undefined;
}

export function parsePage(value: string | string[] | undefined): number {
  const page = Number.parseInt(firstParam(value) ?? "", 10);
  return Number.isFinite(page) && page >= 1 ? page : 1;
}

export function parseSortDirection(value: string | string[] | undefined, fallback: SortDirection = "asc"): SortDirection {
  const dir = firstParam(value);
  return dir === "asc" || dir === "desc" ? dir : fallback;
}

/** Returns `value` only when it is one of the allowed options; otherwise the fallback. */
export function parseOption<T extends string>(
  value: string | string[] | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  const candidate = firstParam(value);
  return allowed.find((option) => option === candidate) ?? fallback;
}

export function pageCount(total: number, pageSize: number = DEFAULT_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** Builds `path?a=1&b=2`, skipping empty values. */
export function buildHref(path: string, params: Record<string, string | number | undefined | null>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && String(value) !== "") query.set(key, String(value));
  }
  const text = query.toString();
  return text ? `${path}?${text}` : path;
}

/** The slice of a total shown as "11-20 de 53". */
export function pageRange(page: number, pageSize: number, total: number): { from: number; to: number } {
  if (total === 0) return { from: 0, to: 0 };
  const from = (page - 1) * pageSize + 1;
  return { from, to: Math.min(total, page * pageSize) };
}
