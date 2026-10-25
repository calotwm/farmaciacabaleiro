import { Badge } from "@/components/ui/badge";
import type { CalendarDate } from "@/shared/domain/dates";
import { cn } from "@/shared/lib/utils";
import { type LotState, describeLot } from "../domain/lot";

const EXPIRY_BADGES = {
  NORMAL: { label: "Normal", className: "text-muted-foreground" },
  WARNING: { label: "Advertencia", className: "bg-warning-soft text-warning-soft-foreground" },
  CRITICAL: { label: "Crítico", className: "bg-warning-soft font-semibold text-warning-soft-foreground ring-1 ring-warning/60 ring-inset" },
  EXPIRED: { label: "Vencido", className: "bg-danger-soft font-semibold text-danger-soft-foreground" },
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
export function LotStatusBadges({
  lot,
  today,
  thresholds,
}: {
  lot: Pick<LotState, "expiryDate" | "status">;
  today: CalendarDate;
  /** Configured expiry thresholds (settings); defaults when omitted. */
  thresholds?: readonly number[];
}) {
  const { effectiveStatus, expiry } = describeLot(lot, today, { thresholds });
  const bucket = EXPIRY_BADGES[expiry.status];
  const held = effectiveStatus === "QUARANTINE" || effectiveStatus === "BLOCKED" || effectiveStatus === "DEPLETED" ? effectiveStatus : null;
  return (
    <div className="flex flex-wrap gap-1">
      <Badge variant={expiry.status === "NORMAL" ? "outline" : "ghost"} className={cn(bucket.className)}>
        {bucket.label}
      </Badge>
      {held ? <Badge variant="secondary">{HELD_LABELS[held]}</Badge> : null}
    </div>
  );
}
