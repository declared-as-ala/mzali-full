import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditService } from '@/audit/audit.service';
import { CurrentUser } from '@/auth/current-user.decorator';
import { JwtAuthGuard, RequestUser } from '@/auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '@/auth/guards/permissions.guard';
import { CashMovementDto, CloseSessionDto, OpenSessionDto, ReportQueryDto } from './dto/session.dto';
import { PosTerminalGuard, PosRequest } from './guards/pos-terminal.guard';
import { toPosSessionContract } from './pos-session.mapper';
import { PosSessionsService } from './pos-sessions.service';

@ApiTags('pos/sessions')
@ApiBearerAuth()
@Controller('pos/sessions')
@UseGuards(JwtAuthGuard, PosTerminalGuard, PermissionsGuard)
export class PosSessionsController {
  constructor(
    private readonly sessions: PosSessionsService,
    private readonly audit: AuditService,
  ) {}

  @Get('current')
  @RequirePermissions('pos.open_session')
  async current(@Req() posReq: PosRequest) {
    const doc = await this.sessions.getOpenForTerminal(posReq.posTerminalId!);
    // Never return a bare null/undefined body — Nest sends that as an
    // empty response (Content-Length 0), which callers can't JSON.parse.
    return { session: doc ? toPosSessionContract(doc) : null };
  }

  @Post('open')
  @RequirePermissions('pos.open_session')
  async open(@Body() dto: OpenSessionDto, @CurrentUser() user: RequestUser, @Req() posReq: PosRequest) {
    const doc = await this.sessions.open(user.userId, posReq.posTerminalId!, null, dto.openingCashMinor);
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: 'pos.session.open',
      entityType: 'pos_cashier_session',
      entityId: doc.id,
      summary: `Session de caisse ouverte (fond ${dto.openingCashMinor} millimes)`,
      ip: posReq.ip,
      locationId: posReq.posLocationId ?? null,
    });
    return toPosSessionContract(doc);
  }

  @Post(':id/close')
  @RequirePermissions('pos.close_session')
  async close(@Param('id') id: string, @Body() dto: CloseSessionDto, @CurrentUser() user: RequestUser, @Req() posReq: PosRequest) {
    const doc = await this.sessions.close(id, dto.closingCountedCashMinor);
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: 'pos.session.close',
      entityType: 'pos_cashier_session',
      entityId: doc.id,
      summary: `Session de caisse fermée (compté ${dto.closingCountedCashMinor} millimes)`,
      ip: posReq.ip,
      locationId: posReq.posLocationId ?? null,
    });
    return toPosSessionContract(doc);
  }

  @Post(':id/cash-movements')
  @RequirePermissions('pos.open_cash_drawer')
  async addCashMovement(@Param('id') id: string, @Body() dto: CashMovementDto, @CurrentUser() user: RequestUser, @Req() posReq: PosRequest) {
    await this.sessions.addCashMovement(id, dto.type, dto.amountMinor, dto.reason, user.userId);
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: 'pos.cash_drawer.open',
      entityType: 'pos_cashier_session',
      entityId: id,
      summary: `Mouvement de caisse ${dto.type} (${dto.amountMinor} millimes) — ${dto.reason}`,
      ip: posReq.ip,
      locationId: posReq.posLocationId ?? null,
    });
    return toPosSessionContract(await this.sessions.getById(id));
  }

  @Get(':id/report')
  @RequirePermissions('pos.close_session')
  async report(@Param('id') id: string, @Query() query: ReportQueryDto) {
    return this.sessions.report(id, query.type ?? 'X');
  }
}
