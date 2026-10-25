import { Badge } from "@/components/ui/badge";
import type { CalendarDate } from "@/shared/domain/dates";
import { cn } from "@/shared/lib/utils";
import { type LotState, describeLot } from "../domain/lot";

const EXPIRY_BADGES = {
  NORMAL: { label: "Normal", className: "" },
  WARNING: { label: "Advertencia", className: "border-amber-500/50 bg-amber-500/15 text-amber-900 dark:text-amber-200" },
  CRITICAL: { label: "Crítico", className: "border-orange-600/50 bg-orange-600/15 text-orange-900 dark:text-orange-200" },
  EXPIRED: { label: "Vencido", className: "border-destructive/50 bg-destructive/15 text-destructive" },
} as const;

const HELD_LABELS = { QUARANTINE: "Cuarentena", BLOCKED: "Bloqueado", DEPLETED: "Agotado" } as const;

/** "Vence hoy", "En 5 días", "Venció hace 3 días". */
export function daysLeftLabel(daysLeft: number): string {
  if (daysLeft === 0) return "Vence hoy";
  if (daysLeft === 1) return "Vence mañana";
  if (daysLeft > 1) return `${daysLeft} días`;
  return daysLeft === -1 ? "Venció ayer" : `Venció hace ${-daysLeft} días`;
}

/**
 * Presentational: the expiry bucket (normal / advertencia / crítico / vencido, from `expiry-status.ts`)
 * plus the stored state when the lot is held or empty (cuarentena / bloqueado / agotado).
 */
export function LotStatusBadges({ lot, today }: { lot: Pick<LotState, "expiryDate" | "status">; today: CalendarDate }) {
  const { effectiveStatus, expiry } = describeLot(lot, today);
  const bucket = EXPIRY_BADGES[expiry.status];
  const held = effectiveStatus === "QUARANTINE" || effectiveStatus === "BLOCKED" || effectiveStatus === "DEPLETED" ? effectiveStatus : null;
  return (
    <div className="flex flex-wrap gap-1">
      <Badge variant="outline" className={cn(bucket.className)}>
        {bucket.label}
      </Badge>
      {held ? <Badge variant="secondary">{HELD_LABELS[held]}</Badge> : null}
    </div>
  );
}
