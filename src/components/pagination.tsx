import Link from "next/link";
import { Button } from "@/components/ui/button";
import { buildHref, pageCount, pageRange } from "@/shared/application/list-query";

interface PaginationProps {
  basePath: string;
  /** Current query params (without `page`); they are preserved in the links. */
  params: Record<string, string | undefined>;
  page: number;
  pageSize: number;
  total: number;
}

/** Server-rendered pagination: plain links, so it works from the URL alone. */
export function Pagination({ basePath, params, page, pageSize, total }: PaginationProps) {
  const pages = pageCount(total, pageSize);
  const current = Math.min(page, pages);
  const { from, to } = pageRange(current, pageSize, total);
  const href = (target: number) => buildHref(basePath, { ...params, page: target > 1 ? target : undefined });

  return (
    <nav aria-label="Paginación" className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <p aria-live="polite" className="text-muted-foreground">
        {total === 0 ? "Sin resultados" : `${from}-${to} de ${total}`}
      </p>
      <div className="flex items-center gap-2">
        {current > 1 ? (
          <Button asChild variant="outline" size="sm">
            <Link href={href(current - 1)} rel="prev">
              Anterior
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Anterior
          </Button>
        )}
        <span>
          Página {current} de {pages}
        </span>
        {current < pages ? (
          <Button asChild variant="outline" size="sm">
            <Link href={href(current + 1)} rel="next">
              Siguiente
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Siguiente
          </Button>
        )}
      </div>
    </nav>
  );
}
