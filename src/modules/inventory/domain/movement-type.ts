export const MOVEMENT_TYPES = [
  "ENTRY",
  "EXIT",
  "ADJUSTMENT_IN",
  "ADJUSTMENT_OUT",
  "RETURN",
  "WRITE_OFF",
  "BLOCK",
  "UNBLOCK",
] as const;

/** Types a user registers from the "Nuevo movimiento" flow. */
export type RegistrableMovementType = (typeof MOVEMENT_TYPES)[number];

/** Types written by a physical count when it is closed (the direction is part of the type). */
export type CountCorrectionType = "COUNT_CORRECTION_IN" | "COUNT_CORRECTION_OUT";

/**
 * Every type that can appear in the history. "COUNT_CORRECTION" is a legacy, direction-less value
 * kept in the enum for compatibility; nothing writes it any more.
 */
export type MovementType = RegistrableMovementType | CountCorrectionType | "COUNT_CORRECTION";

export const HISTORY_MOVEMENT_TYPES: readonly MovementType[] = [
  ...MOVEMENT_TYPES,
  "COUNT_CORRECTION_IN",
  "COUNT_CORRECTION_OUT",
  "COUNT_CORRECTION",
];

export const MOVEMENT_TYPE_LABELS: Record<MovementType, string> = {
  ENTRY: "Entrada",
  EXIT: "Salida",
  ADJUSTMENT_IN: "Ajuste (suma)",
  ADJUSTMENT_OUT: "Ajuste (resta)",
  RETURN: "Devolución al proveedor",
  WRITE_OFF: "Baja",
  BLOCK: "Bloqueo",
  UNBLOCK: "Desbloqueo",
  COUNT_CORRECTION_IN: "Corrección por conteo (suma)",
  COUNT_CORRECTION_OUT: "Corrección por conteo (resta)",
  COUNT_CORRECTION: "Corrección por conteo",
};

/** Effect of a movement on the physical quantity of its lot: +1, -1, or 0 (block/unblock move no units). */
export function stockDirection(type: MovementType): 1 | -1 | 0 {
  switch (type) {
    case "ENTRY":
    case "ADJUSTMENT_IN":
    case "COUNT_CORRECTION_IN":
      return 1;
    case "EXIT":
    case "ADJUSTMENT_OUT":
    case "RETURN":
    case "WRITE_OFF":
    case "COUNT_CORRECTION_OUT":
      return -1;
    default:
      return 0;
  }
}

/** Kind of the `AdjustmentReason` catalog a type draws from (null: free text only). */
export type ReasonKind = "ADJUSTMENT" | "WRITE_OFF" | "RETURN";

export function reasonKindFor(type: MovementType): ReasonKind | null {
  switch (type) {
    case "ADJUSTMENT_IN":
    case "ADJUSTMENT_OUT":
    case "BLOCK":
    case "UNBLOCK":
    case "COUNT_CORRECTION_IN":
    case "COUNT_CORRECTION_OUT":
    case "COUNT_CORRECTION":
      return "ADJUSTMENT";
    case "WRITE_OFF":
      return "WRITE_OFF";
    case "RETURN":
      return "RETURN";
    default:
      return null;
  }
}

/** Everything except plain entries and exits needs a reason (spec: adjustments, returns, write-offs, blocks). */
export function requiresReason(type: MovementType): boolean {
  return type !== "ENTRY" && type !== "EXIT";
}

/** Removing stock for a reason the pharmacy must justify (needs the write-off permission). */
export function isWriteOffOrReturn(type: MovementType): boolean {
  return type === "WRITE_OFF" || type === "RETURN";
}

/** Types an expired lot still accepts: it can only leave the shelf, never be dispensed or topped up. */
export function allowedOnExpiredLot(type: MovementType): boolean {
  return (
    type === "WRITE_OFF" ||
    type === "RETURN" ||
    type === "COUNT_CORRECTION_IN" ||
    type === "COUNT_CORRECTION_OUT" ||
    type === "COUNT_CORRECTION"
  );
}
