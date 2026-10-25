/** Base class for expected, business-level failures. Pure TS: no framework imports. */
export class DomainError extends Error {
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

export class ConflictError extends DomainError {
  constructor(message = "Conflict", userMessage?: string) {
    super("CONFLICT", message, userMessage);
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
