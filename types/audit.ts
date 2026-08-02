// Admin-only type for the new audit-log viewer (mzali-api provider only).
export type AuditLogEntry = {
  id: string;
  actor: { type: string; id: string | null; name: string };
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
};
