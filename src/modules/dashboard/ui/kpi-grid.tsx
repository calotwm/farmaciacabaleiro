import Link from "next/link";
import { cn } from "@/shared/lib/utils";
import type { KpiCard, KpiTone } from "../domain/kpi-cards";

const TONE: Record<KpiTone, string> = {
  default: "",
  warning: "border-amber-500/60 bg-amber-500/5",
  danger: "border-destructive/60 bg-destructive/5",
};

/** KPI cards: the main area links to the matching filtered list; a breakdown adds one link per row. */
export function KpiGrid({ title, cards }: { title: string; cards: KpiCard[] }) {
  return (
    <section aria-labelledby={`kpi-${title}`} className="grid gap-3">
      <h2 id={`kpi-${title}`} className="text-lg font-medium">
        {title}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <div key={card.id} className={cn("bg-card rounded-xl border p-4 shadow-sm", TONE[card.tone])}>
            <Link href={card.href} className="grid gap-1 underline-offset-4 hover:underline focus-visible:underline">
              <span className="text-muted-foreground text-sm">{card.label}</span>
              <span className="text-3xl font-semibold tabular-nums">{card.value}</span>
            </Link>
            {card.breakdown ? (
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {card.breakdown.map((row) => (
                  <li key={row.label}>
                    <Link href={row.href} className="underline underline-offset-4">
                      {row.label}: <span className="tabular-nums">{row.value}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
