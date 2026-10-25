import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { buildHref, type SortDirection } from "@/shared/application/list-query";

interface SortableHeadProps {
  label: string;
  field: string;
  sort: string;
  dir: SortDirection;
  basePath: string;
  /** Current query params (without sort/dir/page). */
  params: Record<string, string | undefined>;
}

/** Column header that toggles the sort through the URL (resets to page 1). */
export function SortableHead({ label, field, sort, dir, basePath, params }: SortableHeadProps) {
  const active = sort === field;
  const nextDir: SortDirection = active && dir === "asc" ? "desc" : "asc";
  const ariaSort = active ? (dir === "asc" ? "ascending" : "descending") : "none";
  return (
    <TableHead aria-sort={ariaSort}>
      <Link
        href={buildHref(basePath, { ...params, sort: field, dir: nextDir })}
        className="inline-flex items-center gap-1 hover:underline"
      >
        {label}
        {active ? dir === "asc" ? <ArrowUp className="size-3.5" aria-hidden /> : <ArrowDown className="size-3.5" aria-hidden /> : null}
      </Link>
    </TableHead>
  );
}
