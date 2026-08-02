import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, FilterQuery } from 'mongoose';
import type { AuditActor, AuditLogQuery } from '@contracts';
import { clampPagination, paginate, Paginated } from '@/common/pagination';
import { AuditLog } from './audit-log.schema';

/** Field names whose values must never appear in audit records. */
const SENSITIVE_KEYS = /pass(word)?|token|secret|hash|salt|authorization|cookie/i;

export type AuditEntry = {
  actor: AuditActor;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  ip?: string | null;
  locationId?: string | null;
  terminalCode?: string | null;
};

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(@InjectModel(AuditLog.name) private readonly model: Model<AuditLog>) {}

  /** Fire-and-forget append. Auditing failures never break the main flow. */
  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.model.create({
        actor: entry.actor,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        summary: entry.summary,
        before: sanitize(entry.before),
        after: sanitize(entry.after),
        ip: entry.ip ?? null,
        locationId: entry.locationId ?? null,
        terminalCode: entry.terminalCode ?? null,
      });
    } catch (err) {
      this.logger.error(`Failed to write audit log (${entry.action}): ${String(err)}`);
    }
  }

  async query(query: AuditLogQuery): Promise<Paginated<AuditLog>> {
    const { page, perPage, skip } = clampPagination(query.page, query.perPage, 100);
    const filter: FilterQuery<AuditLog> = {};
    if (query.entityType) filter.entityType = query.entityType;
    if (query.entityId) filter.entityId = query.entityId;
    if (query.actorId) filter['actor.id'] = query.actorId;
    if (query.action) filter.action = query.action;
    if (query.after || query.before) {
      filter.createdAt = {
        ...(query.after ? { $gte: new Date(query.after) } : {}),
        ...(query.before ? { $lte: new Date(query.before) } : {}),
      };
    }
    const [items, total] = await Promise.all([
      this.model.find(filter).sort({ createdAt: -1 }).skip(skip).limit(perPage).lean(),
      this.model.countDocuments(filter),
    ]);
    return paginate(items, total, page, perPage);
  }
}

function sanitize(
  value: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!value) return null;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    if (SENSITIVE_KEYS.test(key)) {
      out[key] = '[REDACTED]';
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[key] = sanitize(v as Record<string, unknown>);
    } else {
      out[key] = v;
    }
  }
  return out;
}
