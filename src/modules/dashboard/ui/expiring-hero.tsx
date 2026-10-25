import { CalendarClock, CircleCheck } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { type CalendarDate, formatDate } from "@/shared/domain/dates";
import { cn } from "@/shared/lib/utils";
import { EXPIRING_HORIZON_DAYS, type ExpiringLotItem, expiringLotsHref } from "../domain/expiring-lots";

const TONE = {
  danger: { card: "border-danger-soft bg-danger-soft/50 hover:bg-danger-soft", figure: "text-danger-soft-foreground", pill: "bg-danger-soft text-danger-soft-foreground" },
  warning: { card: "border-warning-soft bg-warning-soft/50 hover:bg-warning-soft", figure: "text-warning-soft-foreground", pill: "bg-warning-soft text-warning-soft-foreground" },
} as const;

/**
 * Landing hero: the lots that need action first (expired with stock, then the ones about to expire).
 * Large figures on purpose: the days left must be readable at a glance.
 */
export function ExpiringHero({ items, total, today }: { items: ExpiringLotItem[]; total: number; today: CalendarDate }) {
  const expired = items.filter((item) => item.status === "EXPIRED").length;
  return (
    <section aria-labelledby="expiring-hero" className="bg-card border-border/70 shadow-card grid gap-5 rounded-2xl border p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="bg-primary text-primary-foreground grid size-12 shrink-0 place-items-center rounded-2xl shadow-sm" aria-hidden="true">
            <CalendarClock className="size-6" />
          </span>
          <div className="grid gap-0.5">
            <h2 id="expiring-hero" className="text-2xl font-semibold tracking-tight">
              Próximos a vencer
            </h2>
            <p className="text-muted-foreground text-sm">
              {total === 0
                ? `Vencidos y lotes que vencen en los próximos ${EXPIRING_HORIZON_DAYS} días`
                : `${total} ${total === 1 ? "lote" : "lotes"} vencidos o por vencer en ${EXPIRING_HORIZON_DAYS} días${expired > 0 ? ` · ${expired} ya ${expired === 1 ? "vencido" : "vencidos"}` : ""}`}
            </p>
          </div>
        </div>
        {total > 0 ? (
          <Button asChild variant="outline" size="lg">
            <Link href={expiringLotsHref(today)}>Ver todos{total > items.length ? ` (${total})` : ""}</Link>
          </Button>
        ) : null}
      </div>

      {items.length === 0 ? (
        <div className="bg-success-soft text-success-soft-foreground flex items-center gap-3 rounded-xl p-4">
          <CircleCheck className="size-6 shrink-0" aria-hidden="true" />
          <p className="font-medium">No hay lotes vencidos ni por vencer en los próximos {EXPIRING_HORIZON_DAYS} días.</p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {items.map((item) => {
            const tone = TONE[item.tone];
            return (
              <li key={item.id}>
                <Link
                  href={`/lotes/${item.id}`}
                  className={cn("focus-visible:ring-ring grid h-full gap-3 rounded-xl border p-4 outline-none transition-colors focus-visible:ring-2", tone.card)}
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="grid min-w-0 gap-0.5">
                      <span className="line-clamp-2 font-semibold">{item.product.commercialName}</span>
                      <span className="text-muted-foreground text-xs">Lote {item.lotNumber}</span>
                    </span>
                  </span>
                  <span className="flex items-end justify-between gap-2">
                    <span className={cn("grid leading-none", tone.figure)}>
                      <span className="text-4xl font-bold tabular-nums">{item.headline}</span>
                      <span className="mt-1 text-sm font-medium">{item.caption}</span>
                    </span>
                    <span className="grid justify-items-end gap-1 text-xs">
                      <span className="font-medium tabular-nums">{formatDate(item.expiryDate)}</span>
                      <span className={cn("rounded-full px-2 py-0.5 font-medium tabular-nums", tone.pill)}>
                        {item.quantity} {item.quantity === 1 ? "unidad" : "unidades"}
                      </span>
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
