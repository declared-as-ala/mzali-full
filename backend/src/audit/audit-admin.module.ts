import { Module } from '@nestjs/common';
import { AuditAdminController } from './audit-admin.controller';

/**
 * API-only: the query controller for audit logs. Kept separate from the
 * global AuditModule (service only) so the worker/CLI processes — which
 * both need AuditService for internal logging but never load AuthModule —
 * don't pull in JwtAuthGuard and crash at boot. Same pattern as Shipping's
 * core/API split; see progress.md.
 */
@Module({
  controllers: [AuditAdminController],
})
export class AuditAdminModule {}
