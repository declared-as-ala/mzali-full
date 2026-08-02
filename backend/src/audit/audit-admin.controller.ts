import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '@/auth/guards/permissions.guard';
import { AuditService } from './audit.service';

@ApiTags('admin/audit-logs')
@ApiBearerAuth()
@Controller('admin/audit-logs')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AuditAdminController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions('audit.read')
  query(
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('actorId') actorId?: string,
    @Query('action') action?: string,
    @Query('after') after?: string,
    @Query('before') before?: string,
  ) {
    return this.audit.query({
      page: page ? Number(page) : undefined,
      perPage: perPage ? Number(perPage) : undefined,
      entityType,
      entityId,
      actorId,
      action,
      after,
      before,
    });
  }
}
