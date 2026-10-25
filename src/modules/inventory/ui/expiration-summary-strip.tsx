import Link from "next/link";
import { buildHref } from "@/shared/application/list-query";
import { cn } from "@/shared/lib/utils";
import type { ExpirationBucket } from "../domain/expiration-views";

export interface BucketFigures {
  bucket: ExpirationBucket;
  lots: number;
  units: number;
}

/**
 * One compact row of counts that doubles as the section switcher: each cell is a link to its bucket
 * (keeping the active filters). The current one is marked with a red rule and `aria-current`.
 */
export function ExpirationSummaryStrip({
  items,
  activeId,
  params,
}: {
  items: BucketFigures[];
  activeId: string;
  /** Filters kept in every link (search, category, supplier). */
  params: Record<string, string | undefined>;
}) {
  return (
    <nav aria-label="Ventanas de vencimiento" className="bg-border grid grid-cols-2 gap-px overflow-hidden rounded-xl border lg:grid-flow-col lg:auto-cols-fr lg:grid-cols-none">
      {items.map(({ bucket, lots, units }, index) => {
        const active = bucket.id === activeId;
        const urgent = lots > 0 && (bucket.days === null || bucket.days <= 7);
        return (
          <Link
            key={bucket.id}
            href={buildHref("/vencimientos", { ...params, bucket: bucket.id })}
            aria-current={active ? "page" : undefined}
            className={cn(
              "focus-visible:ring-ring bg-card hover:bg-muted/60 relative grid content-start gap-1 px-4 py-3 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset",
              items.length % 2 === 1 && index === items.length - 1 && "col-span-2 lg:col-span-1",
              active && "bg-muted after:bg-primary after:absolute after:inset-x-0 after:bottom-0 after:h-0.5",
            )}
          >
            <span className="text-muted-foreground text-xs font-medium">{bucket.label}</span>
            <span className={cn("text-2xl font-semibold tracking-tight tabular-nums", urgent && "text-danger-soft-foreground")}>{lots.toLocaleString("es-AR")}</span>
            <span className="text-muted-foreground text-xs tabular-nums">
              {lots === 1 ? "lote" : "lotes"} · {units.toLocaleString("es-AR")} {units === 1 ? "unidad" : "unidades"}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
