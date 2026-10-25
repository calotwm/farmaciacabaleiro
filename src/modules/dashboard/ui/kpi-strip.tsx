import Link from "next/link";
import { cn } from "@/shared/lib/utils";
import type { KpiCard, KpiTone } from "../domain/kpi-cards";

const TONE_VALUE: Record<KpiTone, string> = {
  default: "",
  warning: "text-warning-soft-foreground",
  danger: "text-danger-soft-foreground",
};

/**
 * The main metrics in one compact row: label, prominent figure and an optional qualifier.
 * Each cell links to the list filtered the same way the number was counted.
 */
export function KpiStrip({ label, cards }: { label: string; cards: KpiCard[] }) {
  return (
    <nav aria-label={label} className="bg-border grid grid-cols-2 gap-px overflow-hidden rounded-xl border sm:grid-cols-3 xl:grid-flow-col xl:auto-cols-fr xl:grid-cols-none">
      {cards.map((card) => (
        <Link
          key={card.id}
          href={card.href}
          className="focus-visible:ring-ring bg-card hover:bg-muted/60 grid content-start gap-0.5 px-4 py-3 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset"
        >
          <span className="text-muted-foreground text-xs font-medium">{card.label}</span>
          <span className={cn("text-2xl font-semibold tracking-tight tabular-nums", TONE_VALUE[card.tone])}>{card.value.toLocaleString("es-AR")}</span>
          <span className="text-muted-foreground min-h-4 text-xs">{card.caption ?? ""}</span>
        </Link>
      ))}
    </nav>
  );
}
