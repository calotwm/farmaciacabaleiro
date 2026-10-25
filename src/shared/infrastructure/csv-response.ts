import { isDomainError } from "@/shared/domain/errors";
import { todayInTz } from "@/shared/domain/dates";
import { type CsvCell, toCsv } from "@/shared/lib/csv";

/** Hard cap of rows per export (single-pharmacy data; keeps the response in memory). */
export const EXPORT_ROW_CAP = 50_000;
const EXPORT_PAGE_SIZE = 1000;

class ExportTooLargeError extends Error {}

/** Walks every page of an existing paginated list query, refusing results above the cap. */
export async function collectAll<T>(fetchPage: (page: number, pageSize: number) => Promise<{ items: T[]; total: number }>): Promise<T[]> {
  const first = await fetchPage(1, EXPORT_PAGE_SIZE);
  if (first.total > EXPORT_ROW_CAP) throw new ExportTooLargeError();
  const items = [...first.items];
  for (let page = 2; items.length < first.total; page++) {
    const next = await fetchPage(page, EXPORT_PAGE_SIZE);
    if (next.items.length === 0) break;
    items.push(...next.items);
  }
  return items;
}

/** Runs an export, mapping auth/permission/size failures to HTTP errors and the rows to a CSV download. */
export async function csvDownload(
  name: string,
  build: () => Promise<{ headers: readonly string[]; rows: ReadonlyArray<readonly CsvCell[]> }>,
): Promise<Response> {
  try {
    const { headers, rows } = await build();
    return new Response(toCsv(headers, rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name}-${todayInTz()}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof ExportTooLargeError) {
      return new Response(`Demasiados registros (máximo ${EXPORT_ROW_CAP}). Ajustá los filtros.`, { status: 422 });
    }
    if (isDomainError(error) && error.code === "UNAUTHENTICATED") return new Response("No autenticado.", { status: 401 });
    if (isDomainError(error) && error.code === "FORBIDDEN") return new Response("Sin permiso.", { status: 403 });
    throw error;
  }
}
