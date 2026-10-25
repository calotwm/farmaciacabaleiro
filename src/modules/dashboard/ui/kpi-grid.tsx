import {
  AlarmClock,
  ArrowDownToLine,
  Boxes,
  CalendarClock,
  CalendarDays,
  CalendarX2,
  ClipboardCheck,
  type LucideIcon,
  Package,
  PackageX,
  Truck,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/shared/lib/utils";
import type { KpiCard, KpiTone } from "../domain/kpi-cards";

const ICONS: Record<string, LucideIcon> = {
  products: Package,
  units: Boxes,
  low: ArrowDownToLine,
  out: PackageX,
  expiring: CalendarClock,
  expired: CalendarX2,
  "deliveries-today": Truck,
  "deliveries-week": CalendarDays,
  "deliveries-late": AlarmClock,
  "deliveries-pending": ClipboardCheck,
};

/** Tinted circle behind the icon: neutral by default, amber for warnings, red for critical. */
const TONE_ICON: Record<KpiTone, string> = {
  default: "bg-muted text-muted-foreground",
  warning: "bg-warning-soft text-warning-soft-foreground",
  danger: "bg-danger-soft text-danger-soft-foreground",
};

const TONE_VALUE: Record<KpiTone, string> = {
  default: "",
  warning: "text-warning-soft-foreground",
  danger: "text-danger-soft-foreground",
};

/** KPI cards: the main area links to the matching filtered list; a breakdown adds one link per row. */
export function KpiGrid({ title, cards }: { title: string; cards: KpiCard[] }) {
  return (
    <section aria-labelledby={`kpi-${title}`} className="grid gap-3">
      <h2 id={`kpi-${title}`} className="text-lg font-semibold">
        {title}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => {
          const Icon = ICONS[card.id] ?? Package;
          return (
            <div key={card.id} className="bg-card border-border/70 shadow-card rounded-2xl border p-5">
              <Link href={card.href} className="group flex items-start justify-between gap-3 outline-none">
                <span className="grid gap-1">
                  <span className="text-muted-foreground text-sm font-medium group-hover:underline group-focus-visible:underline">{card.label}</span>
                  <span className={cn("text-4xl font-semibold tracking-tight tabular-nums", TONE_VALUE[card.tone])}>
                    {card.value.toLocaleString("es-AR")}
                  </span>
                </span>
                <span className={cn("grid size-11 shrink-0 place-items-center rounded-full", TONE_ICON[card.tone])} aria-hidden="true">
                  <Icon className="size-5" />
                </span>
              </Link>
              {card.breakdown ? (
                <ul className="mt-4 flex flex-wrap gap-2 text-xs">
                  {card.breakdown.map((row) => (
                    <li key={row.label}>
                      <Link
                        href={row.href}
                        className="bg-muted hover:bg-primary-soft hover:text-primary-soft-foreground inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium transition-colors"
                      >
                        {row.label}
                        <span className="tabular-nums">{row.value}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
