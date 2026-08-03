import { Body, Controller, Headers, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditService } from '@/audit/audit.service';
import { CurrentUser } from '@/auth/current-user.decorator';
import { JwtAuthGuard, RequestUser } from '@/auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '@/auth/guards/permissions.guard';
import { ManualDrawerAuthorizationDto, ManualDrawerEventDto, PaymentDrawerEventDto } from './dto/drawer-event.dto';
import { PosRequest, PosTerminalGuard } from './guards/pos-terminal.guard';
import { PosSalesService } from './pos-sales.service';

@ApiTags('pos/hardware')
@ApiBearerAuth()
@Controller('pos/hardware')
@UseGuards(JwtAuthGuard, PosTerminalGuard, PermissionsGuard)
export class PosHardwareController {
  constructor(private readonly audit: AuditService, private readonly sales: PosSalesService) {}

  @Post('drawer/payment-event')
  @RequirePermissions('pos.sell')
  async paymentEvent(
    @Body() dto: PaymentDrawerEventDto,
    @CurrentUser() user: RequestUser,
    @Req() request: PosRequest,
    @Headers('x-pos-terminal') terminalCode: string,
  ) {
    const sale = await this.sales.getById(dto.saleId);
    if (!sale || sale.terminalId !== request.posTerminalId) return { ok: false, ignored: true };
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: `pos.cash_drawer.${dto.outcome}`,
      entityType: 'pos_sale',
      entityId: dto.saleId,
      summary: dto.outcome === 'opened'
        ? `Tiroir-caisse ouvert après paiement de la vente ${dto.saleId}`
        : dto.outcome === 'skipped'
          ? `Ouverture du tiroir non requise pour la vente ${dto.saleId}`
          : `Échec d’ouverture du tiroir après la vente ${dto.saleId}`,
      after: dto.error ? { outcome: dto.outcome, error: dto.error } : { outcome: dto.outcome },
      ip: request.ip,
      locationId: request.posLocationId ?? null,
      terminalCode,
    });
    return { ok: true };
  }

  @Post('drawer/manual-authorize')
  @RequirePermissions('pos.open_cash_drawer')
  async authorizeManual(
    @Body() dto: ManualDrawerAuthorizationDto,
    @CurrentUser() user: RequestUser,
    @Req() request: PosRequest,
    @Headers('x-pos-terminal') terminalCode: string,
  ) {
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: 'pos.cash_drawer.requested',
      entityType: 'pos_terminal',
      entityId: request.posTerminalId ?? null,
      summary: dto.reason === 'test' ? 'Test d’ouverture du tiroir demandé' : 'Ouverture manuelle du tiroir demandée',
      ip: request.ip,
      locationId: request.posLocationId ?? null,
      terminalCode,
    });
    return { authorized: true };
  }

  @Post('drawer/manual-event')
  @RequirePermissions('pos.open_cash_drawer')
  async manualEvent(
    @Body() dto: ManualDrawerEventDto,
    @CurrentUser() user: RequestUser,
    @Req() request: PosRequest,
    @Headers('x-pos-terminal') terminalCode: string,
  ) {
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: dto.outcome === 'opened' ? 'pos.cash_drawer.opened' : 'pos.cash_drawer.failed',
      entityType: 'pos_terminal',
      entityId: request.posTerminalId ?? null,
      summary: `${dto.reason === 'test' ? 'Test' : 'Ouverture manuelle'} du tiroir : ${dto.outcome === 'opened' ? 'réussi' : 'échoué'}`,
      after: dto.error ? { reason: dto.reason, outcome: dto.outcome, error: dto.error } : { reason: dto.reason, outcome: dto.outcome },
      ip: request.ip,
      locationId: request.posLocationId ?? null,
      terminalCode,
    });
    return { ok: true };
  }
}
