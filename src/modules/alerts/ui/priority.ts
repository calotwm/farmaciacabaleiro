export type NotificationPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export const PRIORITY_LABELS: Record<NotificationPriority, string> = {
  LOW: "Baja",
  MEDIUM: "Media",
  HIGH: "Alta",
  CRITICAL: "Crítica",
};

/** Dot color per priority; the label always accompanies it so color is never the only signal. */
export const PRIORITY_DOT: Record<NotificationPriority, string> = {
  LOW: "bg-slate-400",
  MEDIUM: "bg-amber-500",
  HIGH: "bg-orange-600",
  CRITICAL: "bg-red-600",
};
