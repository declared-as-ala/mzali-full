// Backend-only contract (not mirrored from frontend types/).

export type AuditActor = {
  type: 'employee' | 'system' | 'migration' | 'service';
  id: string | null;
  name: string;
};

export type AuditLogEntry = {
  id: string;
  actor: AuditActor;
  action: string;               // e.g. "order.status_change", "employee.create"
  entityType: string;           // e.g. "order", "product", "employee"
  entityId: string | null;
  summary: string;
  /** Sanitized before/after snippets. Never contains hashes, tokens or secrets. */
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
};

export type AuditLogQuery = {
  page?: number;
  perPage?: number;
  entityType?: string;
  entityId?: string;
  actorId?: string;
  action?: string;
  after?: string;
  before?: string;
};
