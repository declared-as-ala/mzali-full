import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { AuditService } from '@/audit/audit.service';
import { CurrentUser } from '@/auth/current-user.decorator';
import { AuthedRequest, JwtAuthGuard, RequestUser } from '@/auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '@/auth/guards/permissions.guard';
import { PosSessionsService } from './pos-sessions.service';
import { toPosTerminalContract } from './pos-terminal.mapper';
import { PosTerminalsService } from './pos-terminals.service';

class ApproveTerminalDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() locationId?: string;
}

class UpdateTerminalDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() locationId?: string;
  @IsOptional() @IsString() registerId?: string;
}

@ApiTags('admin/pos/terminals')
@ApiBearerAuth()
@Controller('admin/pos/terminals')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PosTerminalsAdminController {
  constructor(
    private readonly terminals: PosTerminalsService,
    private readonly sessions: PosSessionsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions('pos.terminals.manage')
  async list() {
    const docs = await this.terminals.list();
    return docs.map(toPosTerminalContract);
  }

  @Get('pending')
  @RequirePermissions('pos.terminals.manage')
  async listPending() {
    const docs = await this.terminals.listPending();
    return docs.map(toPosTerminalContract);
  }

  @Post(':id/approve')
  @RequirePermissions('pos.terminals.manage')
  async approve(@Param('id') id: string, @Body() dto: ApproveTerminalDto, @CurrentUser() user: RequestUser, @Req() req: AuthedRequest) {
    const doc = await this.terminals.approve(id, user.userId, dto);
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: 'pos.terminal.approve', entityType: 'pos_terminal', entityId: doc.id,
      summary: `Terminal ${doc.terminalCode} approuvé`, ip: req.ip,
    });
    return toPosTerminalContract(doc);
  }

  @Post(':id/revoke')
  @RequirePermissions('pos.terminals.manage')
  async revoke(@Param('id') id: string, @CurrentUser() user: RequestUser, @Req() req: AuthedRequest) {
    const doc = await this.terminals.getById(id);
    await this.terminals.revoke(id);
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: 'pos.terminal.revoke', entityType: 'pos_terminal', entityId: id,
      summary: `Terminal ${doc.terminalCode} révoqué`, ip: req.ip,
    });
    return { ok: true };
  }

  @Post(':id/update')
  @RequirePermissions('pos.terminals.manage')
  async update(@Param('id') id: string, @Body() dto: UpdateTerminalDto, @CurrentUser() user: RequestUser, @Req() req: AuthedRequest) {
    const doc = await this.terminals.update(id, dto);
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: 'pos.terminal.update', entityType: 'pos_terminal', entityId: doc.id,
      summary: `Terminal ${doc.terminalCode} reconfiguré`, ip: req.ip,
    });
    return toPosTerminalContract(doc);
  }

  @Post(':id/force-logout')
  @RequirePermissions('pos.terminals.manage')
  async forceLogout(@Param('id') id: string, @CurrentUser() user: RequestUser, @Req() req: AuthedRequest) {
    const terminal = await this.terminals.getById(id);
    const openSession = await this.sessions.getOpenForTerminal(id);
    if (!openSession) return { ok: true, closedSession: false };
    await this.sessions.forceClose(openSession.id, user.name);
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: 'pos.terminal.force_logout', entityType: 'pos_terminal', entityId: id,
      summary: `Session forcée à la fermeture sur ${terminal.terminalCode} — comptage à vérifier`,
      ip: req.ip, locationId: terminal.locationId,
    });
    return { ok: true, closedSession: true, sessionId: openSession.id };
  }
}
