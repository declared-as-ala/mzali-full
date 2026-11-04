import { roleHasPermission } from '@/auth/permissions';
import { Body, Controller, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditService } from '@/audit/audit.service';
import { CurrentUser } from '@/auth/current-user.decorator';
import { JwtAuthGuard, RequestUser } from '@/auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '@/auth/guards/permissions.guard';
import { CashMovementDto, CloseSessionDto, OpenSessionDto, ReportQueryDto, TakeoverSessionDto } from './dto/session.dto';
import { PosTerminalGuard, PosRequest } from './guards/pos-terminal.guard';
import { toPosSessionContract } from './pos-session.mapper';
import { PosSessionsService } from './pos-sessions.service';
import { expectedCash } from './cash-accounting';
import { renderSessionTicketZPdf } from './ticket-z-pdf';

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
  async current(@Req() posReq: PosRequest, @CurrentUser() user: RequestUser) {
    const doc = await this.sessions.getOpenForTerminal(posReq.posTerminalId!);
    if (!doc) {
      return { session: null, activeSessionOtherCashier: null };
    }

    const cashierName = await this.sessions.resolveCashierName(doc.cashierId);
    const terminalName = await this.sessions.resolveTerminalName(doc.terminalId);

    // If current cashier owns it, return the session directly
    if (doc.cashierId === user.userId) {
      return {
        session: toPosSessionContract(doc, { cashierName, terminalName }),
        activeSessionOtherCashier: null,
      };
    }

    // If accessing user is a manager or admin, allow manager access without 403
    const isManager = roleHasPermission(user.role, 'pos.sessions.read') || ['admin', 'super_admin', 'store_manager'].includes(user.role);
    if (isManager) {
      return {
        session: toPosSessionContract(doc, { cashierName, terminalName }),
        activeSessionOtherCashier: null,
        isManagerAccess: true,
      };
    }

    // Otherwise, terminal is currently occupied by another cashier — return structured information instead of throwing 403
    return {
      session: null,
      activeSessionOtherCashier: {
        sessionId: doc.id,
        cashierId: doc.cashierId,
        cashierName,
        terminalId: doc.terminalId,
        terminalName,
        openedAt: doc.openedAt.toISOString(),
        openingCashMinor: doc.openingCashMinor,
        expectedCashMinor: expectedCash(doc),
      },
    };
  }

  @Post('open')
  @RequirePermissions('pos.open_session')
  async open(@Body() dto: OpenSessionDto, @CurrentUser() user: RequestUser, @Req() posReq: PosRequest) {
    const doc = await this.sessions.open(user.userId, posReq.posTerminalId!, null, dto.openingCashMinor, dto.note);
    const cashierName = await this.sessions.resolveCashierName(doc.cashierId);
    const terminalName = await this.sessions.resolveTerminalName(doc.terminalId);
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: 'pos.session.open',
      entityType: 'pos_cashier_session',
      entityId: doc.id,
      summary: `Session de caisse ouverte (fond ${dto.openingCashMinor} millimes)`,
      ip: posReq.ip,
      locationId: posReq.posLocationId ?? null,
    });
    return toPosSessionContract(doc, { cashierName, terminalName });
  }

  @Post(':id/close')
  @RequirePermissions('pos.close_session')
  async close(@Param('id') id: string, @Body() dto: CloseSessionDto, @CurrentUser() user: RequestUser, @Req() posReq: PosRequest) {
    await this.sessions.assertAccess(id, posReq.posTerminalId!, user.userId, roleHasPermission(user.role, 'pos.sessions.read'));
    const doc = await this.sessions.close(id, dto.closingCountedCashMinor, dto.note);
    const cashierName = await this.sessions.resolveCashierName(doc.cashierId);
    const terminalName = await this.sessions.resolveTerminalName(doc.terminalId);
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: 'pos.session.close',
      entityType: 'pos_cashier_session',
      entityId: doc.id,
      summary: `Session de caisse fermée (compté ${dto.closingCountedCashMinor} millimes)`,
      ip: posReq.ip,
      locationId: posReq.posLocationId ?? null,
    });
    return toPosSessionContract(doc, { cashierName, terminalName });
  }

  @Post(':id/takeover')
  @RequirePermissions('pos.sessions.review')
  async takeover(@Param('id') id: string, @Body() dto: TakeoverSessionDto, @CurrentUser() user: RequestUser, @Req() posReq: PosRequest) {
    const doc = await this.sessions.takeover(id, user.userId, user.name, dto.note);
    const cashierName = await this.sessions.resolveCashierName(doc.cashierId);
    const terminalName = await this.sessions.resolveTerminalName(doc.terminalId);
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: 'pos.session.takeover',
      entityType: 'pos_cashier_session',
      entityId: id,
      summary: `Reprise de caisse par ${user.name} (Session ${id})`,
      ip: posReq.ip,
      locationId: posReq.posLocationId ?? null,
    });
    return toPosSessionContract(doc, { cashierName, terminalName });
  }

  @Post(':id/force-close')
  @RequirePermissions('pos.sessions.review')
  async forceClose(@Param('id') id: string, @Body() dto: CloseSessionDto, @CurrentUser() user: RequestUser, @Req() posReq: PosRequest) {
    const doc = await this.sessions.forceClose(id, user.name, dto.closingCountedCashMinor, dto.note);
    const cashierName = await this.sessions.resolveCashierName(doc.cashierId);
    const terminalName = await this.sessions.resolveTerminalName(doc.terminalId);
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: 'pos.session.force_close',
      entityType: 'pos_cashier_session',
      entityId: id,
      summary: `Fermeture administrative de caisse par ${user.name} (Session ${id})`,
      ip: posReq.ip,
      locationId: posReq.posLocationId ?? null,
    });
    return toPosSessionContract(doc, { cashierName, terminalName });
  }

  @Get(':id/cash-movements')
  @RequirePermissions('pos.open_session')
  async listCashMovements(@Param('id') id: string, @Req() posReq: PosRequest, @CurrentUser() user: RequestUser) {
    await this.sessions.assertAccess(id, posReq.posTerminalId!, user.userId, roleHasPermission(user.role, 'pos.sessions.read'));
    return this.sessions.listMovements(id);
  }

  @Post(':id/cash-movements')
  @RequirePermissions('pos.open_session')
  async addCashMovement(@Param('id') id: string, @Body() dto: CashMovementDto, @CurrentUser() user: RequestUser, @Req() posReq: PosRequest) {
    await this.sessions.assertAccess(id, posReq.posTerminalId!, user.userId, roleHasPermission(user.role, 'pos.sessions.read'));
    const movement = await this.sessions.addCashMovement(
      id,
      {
        type: dto.type,
        amountMinor: dto.amountMinor,
        reason: dto.reason,
        category: dto.category,
        categoryLabel: dto.categoryLabel,
        beneficiary: dto.beneficiary,
        paymentMethod: dto.paymentMethod,
        reference: dto.reference,
      },
      user.userId,
      user.name,
    );
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: 'pos.cash_movement.create',
      entityType: 'pos_cashier_session',
      entityId: id,
      summary: `Mouvement de caisse ${dto.type} (${dto.amountMinor} millimes) — ${dto.categoryLabel ?? dto.category ?? ''} ${dto.reason}`,
      ip: posReq.ip,
      locationId: posReq.posLocationId ?? null,
    });
    const doc = await this.sessions.getById(id);
    const cashierName = await this.sessions.resolveCashierName(doc.cashierId);
    const terminalName = await this.sessions.resolveTerminalName(doc.terminalId);
    return {
      session: toPosSessionContract(doc, { cashierName, terminalName }),
      movement,
    };
  }

  @Get(':id/report')
  @RequirePermissions('pos.close_session')
  async report(@Param('id') id: string, @Query() query: ReportQueryDto, @Req() posReq: PosRequest, @CurrentUser() user: RequestUser) {
    await this.sessions.assertAccess(id, posReq.posTerminalId!, user.userId, roleHasPermission(user.role, 'pos.sessions.read'));
    return this.sessions.report(id, query.type ?? 'X');
  }

  @Get(':id/pdf')
  @RequirePermissions('pos.close_session')
  async pdf(@Param('id') id: string, @Res() res: Response, @Req() posReq: PosRequest, @CurrentUser() user: RequestUser) {
    await this.sessions.assertAccess(id, posReq.posTerminalId!, user.userId, roleHasPermission(user.role, 'pos.sessions.read'));
    const report = await this.sessions.report(id, 'Z');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="ticket-z-session-${id.slice(-6)}.pdf"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(await renderSessionTicketZPdf(report));
  }
}
