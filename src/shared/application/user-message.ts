import { DomainError } from "../domain/errors";

const MESSAGES: Record<string, string> = {
  NOT_FOUND: "No se encontró el recurso solicitado.",
  FORBIDDEN: "No tenés permiso para realizar esta acción.",
  UNAUTHENTICATED: "Tenés que iniciar sesión para continuar.",
  VALIDATION: "Revisá los datos ingresados.",
  CONFLICT: "La operación entra en conflicto con el estado actual.",
  RATE_LIMITED: "Demasiados intentos. Probá de nuevo en unos minutos.",
};

export const UNKNOWN_ERROR_MESSAGE = "Ocurrió un error inesperado. Intentá de nuevo.";

/**
 * Maps an error to a Spanish message safe to show to users. Unknown errors never
 * leak internals; DomainError subclasses get their generic message per code.
 */
export function toUserMessage(error: unknown): string {
  if (error instanceof DomainError) return MESSAGES[error.code] ?? UNKNOWN_ERROR_MESSAGE;
  return UNKNOWN_ERROR_MESSAGE;
}
