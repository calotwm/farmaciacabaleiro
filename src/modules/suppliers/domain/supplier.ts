export const SUPPLIER_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export type SupplierStatus = (typeof SUPPLIER_STATUSES)[number];

export const SUPPLIER_STATUS_LABELS: Record<SupplierStatus, string> = {
  ACTIVE: "Activo",
  INACTIVE: "Inactivo",
};

/** Visit days are ISO weekdays stored as integers: 1 = Monday ... 7 = Sunday. */
export const WEEKDAYS = [
  { value: 1, label: "Lunes", short: "Lun" },
  { value: 2, label: "Martes", short: "Mar" },
  { value: 3, label: "Miércoles", short: "Mié" },
  { value: 4, label: "Jueves", short: "Jue" },
  { value: 5, label: "Viernes", short: "Vie" },
  { value: 6, label: "Sábado", short: "Sáb" },
  { value: 7, label: "Domingo", short: "Dom" },
] as const;

/** Sorted, de-duplicated and restricted to 1..7. */
export function normalizeVisitDays(days: readonly number[]): number[] {
  return [...new Set(days)].filter((day) => Number.isInteger(day) && day >= 1 && day <= 7).sort((a, b) => a - b);
}

/** "Lun, Mié, Vie" (empty string when there are none). */
export function formatVisitDays(days: readonly number[]): string {
  return normalizeVisitDays(days)
    .map((day) => WEEKDAYS[day - 1].short)
    .join(", ");
}
