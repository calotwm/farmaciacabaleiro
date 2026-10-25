export interface AuditEntry {
  actorId?: string | null;
  /** Dotted action name, e.g. "auth.login.success" or "user.create". */
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
}

/** Port: where audit entries are persisted. */
export interface AuditWriter {
  write(entry: AuditEntry): Promise<void>;
}

export type RecordAudit = (entry: AuditEntry) => Promise<void>;

/**
 * Builds the `recordAudit` helper. Audit writes must never break the business
 * flow that triggered them, so failures are logged and swallowed.
 */
export function createRecordAudit(writer: AuditWriter, onError: (error: unknown) => void = console.error): RecordAudit {
  return async (entry) => {
    try {
      await writer.write(entry);
    } catch (error) {
      onError(error);
    }
  };
}
