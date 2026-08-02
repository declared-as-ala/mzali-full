import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditService } from '@/audit/audit.service';
import { CurrentUser } from '@/auth/current-user.decorator';
import { JwtAuthGuard, RequestUser } from '@/auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '@/auth/guards/permissions.guard';
import { AssignCardDto } from '@/loyalty/dto/loyalty-card.dto';
import { CreateLoyaltyAccountDto, RedeemPreviewDto } from '@/loyalty/dto/loyalty.dto';
import { toCardContract } from '@/loyalty/loyalty-card.mapper';
import { LoyaltyCardsService } from '@/loyalty/loyalty-cards.service';
import { toAccountContract } from '@/loyalty/loyalty.mapper';
import { LoyaltyService } from '@/loyalty/loyalty.service';
import { PosRequest, PosTerminalGuard } from './guards/pos-terminal.guard';

/**
 * POS-scoped loyalty endpoints. `redeem` here is a preview-only guard
 * check (no database write) so the till can show "N points = X DT off"
 * before the cashier finalizes payment — the actual atomic points
 * deduction + discount application happens inside
 * PosSalesService.create() via the sale's own `redeemPoints` field, in the
 * same transaction as the rest of the sale (see loyalty-system.md
 * §"Redemption"). This two-call shape (preview here, commit inside the
 * sale) is how "same transaction as the POS sale" is achievable across
 * two separate HTTP round-trips.
 */
@ApiTags('pos/loyalty')
@ApiBearerAuth()
@Controller('pos/loyalty')
@UseGuards(JwtAuthGuard, PosTerminalGuard, PermissionsGuard)
export class PosLoyaltyController {
  constructor(
    private readonly loyalty: LoyaltyService,
    private readonly cards: LoyaltyCardsService,
    private readonly audit: AuditService,
  ) {}

  @Get('lookup/:phone')
  @RequirePermissions('loyalty.view')
  async lookup(@Param('phone') phone: string) {
    const result = await this.loyalty.lookupByPhone(phone);
    return {
      customerId: result.customerId,
      customerName: result.customerName,
      account: result.account ? toAccountContract(result.account) : null,
    };
  }

  @Post('accounts')
  @RequirePermissions('loyalty.view')
  async createAccount(@Body() dto: CreateLoyaltyAccountDto) {
    const account = await this.loyalty.createAccount(dto);
    const customer = await this.loyalty.getCustomer(account.customerId);
    return toAccountContract(account, customer);
  }

  @Post('redeem')
  @RequirePermissions('loyalty.view')
  async redeemPreview(@Body() dto: RedeemPreviewDto, @CurrentUser() user: RequestUser) {
    const account = await this.loyalty.getById(dto.accountId);
    if (!account) return { valid: false, discountMinor: 0, requiresManagerApproval: false, error: 'Compte de fidélité introuvable' };
    return this.loyalty.validateRedemption(account, dto.points, dto.saleSubtotalMinor, dto.managerApproval, user.role);
  }

  /** Identify a loyalty customer at checkout by card number or QR token —
   *  scanning a card only resolves who the account belongs to, it never
   *  authorizes a redemption by itself (see loyalty-card-security.md). */
  @Get('cards/lookup')
  @RequirePermissions('loyalty.view')
  async lookupCard(@Query('cardNumber') cardNumber?: string, @Query('qrToken') qrToken?: string) {
    const card = await this.cards.lookup({ cardNumber, qrToken });
    if (!card) return { found: false, card: null, account: null };
    const account = card.accountId ? await this.loyalty.getById(card.accountId) : null;
    const customer = account ? await this.loyalty.getCustomer(account.customerId) : null;
    return {
      found: true,
      card: toCardContract(card, customer),
      account: account ? toAccountContract(account, customer) : null,
    };
  }

  @Post('cards/assign')
  @RequirePermissions('loyalty.view')
  async assignCard(@Body() dto: AssignCardDto, @CurrentUser() user: RequestUser, @Req() posReq: PosRequest) {
    const { card, account } = await this.cards.assign(
      { cardNumber: dto.cardNumber, qrToken: dto.qrToken },
      { customerId: dto.customerId, phone: dto.phone, firstName: dto.firstName, lastName: dto.lastName },
      { type: 'employee', id: user.userId, name: user.name },
    );
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: 'loyalty.cards.assign',
      entityType: 'loyalty_card',
      entityId: card.id,
      summary: `Carte ${card.cardNumber} attribuée (POS)`,
      ip: posReq.ip,
      locationId: posReq.posLocationId ?? null,
    });
    return { card: toCardContract(card), accountId: account.id };
  }
}
