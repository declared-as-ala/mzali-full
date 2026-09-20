import { BadRequestException, Controller, Get, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard, RequestUser } from '@/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@/auth/current-user.decorator';
import { PermissionsGuard, RequirePermissions } from '@/auth/guards/permissions.guard';
import { AuditService } from '@/audit/audit.service';
import { PosDailyZService } from './pos-daily-z.service';
import { renderTicketZPdf } from './ticket-z-pdf';

@Controller('admin/pos/tickets-z')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PosDailyZController {
  constructor(private readonly reports: PosDailyZService, private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions('pos.sessions.read')
  list(@Query('from') from?: string, @Query('to') to?: string, @Query('terminalId') terminalId?: string, @Query('cashierId') cashierId?: string) {
    return this.reports.list(from, to, terminalId, cashierId);
  }

  @Get(':date')
  @RequirePermissions('pos.sessions.read')
  get(@Param('date') date: string) { return this.reports.get(date); }

  @Post(':date/close')
  @RequirePermissions('pos.sessions.review')
  async close(@Param('date') date: string, @CurrentUser() user: RequestUser) {
    const result = await this.reports.finalize(date, user.userId);
    await this.audit.log({ actor: { type: 'employee', id: user.userId, name: user.name }, action: 'pos.daily_z.close', entityType: 'pos_daily_z', entityId: date, summary: `Clôture ${result.number}` });
    return result;
  }

  @Get(':date/pdf')
  @RequirePermissions('pos.sessions.read')
  async pdf(@Param('date') date: string, @Res() res: Response) {
    const report = await this.reports.get(date);
    if (report.status !== 'CLOSED') throw new BadRequestException('Clôturez la journée avant de télécharger le Ticket Z définitif');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="ticket-z-${date}.pdf"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(await renderTicketZPdf(report));
  }
}
