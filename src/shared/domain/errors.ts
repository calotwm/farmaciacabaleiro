/**
 * Brand checked by `isDomainError`. Next.js can bundle this module more than once (RSC and
 * server-action layers), which makes `instanceof` unreliable across them; a registry symbol is not.
 */
const DOMAIN_ERROR_BRAND = Symbol.for("farmacia.domain-error");

/** Base class for expected, business-level failures. Pure TS: no framework imports. */
export class DomainError extends Error {
  readonly [DOMAIN_ERROR_BRAND] = true;
  readonly code: string;
  /** Optional Spanish message for end users; falls back to a generic one per code. */
  readonly userMessage?: string;

  constructor(code: string, message: string, userMessage?: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.userMessage = userMessage;
  }
}

export class NotFoundError extends DomainError {
  constructor(entity = "resource", message = `${entity} not found`) {
    super("NOT_FOUND", message);
  }
}

export class ForbiddenError extends DomainError {
  readonly permission?: string;

  constructor(permission?: string, message = "Forbidden") {
    super("FORBIDDEN", message);
    this.permission = permission;
  }
}

export class UnauthenticatedError extends DomainError {
  constructor(message = "Authentication required") {
    super("UNAUTHENTICATED", message);
  }
}

/** `fieldErrors` maps a field name to user-facing messages (Spanish, set at the edge). */
export class ValidationError extends DomainError {
  readonly fieldErrors: Readonly<Record<string, string[]>>;

  constructor(message = "Validation failed", fieldErrors: Record<string, string[]> = {}, userMessage?: string) {
    super("VALIDATION", message, userMessage);
    this.fieldErrors = fieldErrors;
  }
}

/** Optional `fieldErrors` lets a form highlight the field that caused the conflict (e.g. a duplicate barcode). */
export class ConflictError extends DomainError {
  readonly fieldErrors: Readonly<Record<string, string[]>>;

  constructor(message = "Conflict", userMessage?: string, fieldErrors: Record<string, string[]> = {}) {
    super("CONFLICT", message, userMessage);
    this.fieldErrors = fieldErrors;
  }
}

export class InvalidCredentialsError extends DomainError {
  constructor() {
    super("INVALID_CREDENTIALS", "Invalid email or password");
  }
}

export class RateLimitError extends DomainError {
  constructor(message = "Too many attempts") {
    super("RATE_LIMITED", message);
  }
}

/** True for any DomainError, even one created by another copy of this module. */
export function isDomainError(error: unknown): error is DomainError {
  return typeof error === "object" && error !== null && (error as Record<symbol, unknown>)[DOMAIN_ERROR_BRAND] === true;
}

/** Code-based check that, unlike `instanceof`, survives duplicated module copies. */
export function hasErrorCode(error: unknown, code: string): error is DomainError {
  return isDomainError(error) && error.code === code;
}
