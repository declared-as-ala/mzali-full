import { Body, Controller, Get, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditService } from '@/audit/audit.service';
import { CurrentUser } from '@/auth/current-user.decorator';
import { AuthedRequest, JwtAuthGuard, RequestUser } from '@/auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '@/auth/guards/permissions.guard';
import { CreateLoyaltyAccountDto, ManualAdjustmentDto } from './dto/loyalty.dto';
import { toAccountContract } from './loyalty.mapper';
import { LoyaltyService } from './loyalty.service';

@ApiTags('loyalty')
@ApiBearerAuth()
@Controller('loyalty')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LoyaltyController {
  constructor(
    private readonly loyalty: LoyaltyService,
    private readonly audit: AuditService,
  ) {}

  @Get('accounts/:cardNumber')
  @RequirePermissions('loyalty.view')
  async getByCardNumber(@Param('cardNumber') cardNumber: string) {
    const account = await this.loyalty.getByCardNumber(cardNumber);
    if (!account) throw new NotFoundException('Compte de fidélité introuvable');
    const customer = await this.loyalty.getCustomer(account.customerId);
    return toAccountContract(account, customer);
  }

  @Post('accounts')
  @RequirePermissions('loyalty.view')
  async createAccount(@Body() dto: CreateLoyaltyAccountDto) {
    const account = await this.loyalty.createAccount(dto);
    const customer = await this.loyalty.getCustomer(account.customerId);
    return toAccountContract(account, customer);
  }

  @Post('adjustments')
  @RequirePermissions('loyalty.adjust')
  async adjust(@Body() dto: ManualAdjustmentDto, @CurrentUser() user: RequestUser, @Req() req: AuthedRequest) {
    const account = await this.loyalty.manualAdjustment(dto.accountId, dto.pointsDelta, dto.reason, user.userId);
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: 'loyalty.adjustment',
      entityType: 'loyalty_account',
      entityId: account.id,
      summary: `Ajustement de ${dto.pointsDelta} points — ${dto.reason}`,
      ip: req.ip,
    });
    return toAccountContract(account);
  }
}
