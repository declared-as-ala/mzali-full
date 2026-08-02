import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ServiceTokenGuard } from '@/auth/guards/service-token.guard';
import { LoyaltyService } from './loyalty.service';

/**
 * Storefront-facing lookup — the "minimum viable" loyalty surface agreed
 * at Sprint 8 kickoff (phone/card lookup, no full customer-account/login
 * system). Deliberately returns only what a customer needs to see their
 * own balance, nothing else.
 */
@ApiTags('loyalty/public')
@Controller('loyalty/public')
@UseGuards(ServiceTokenGuard)
export class LoyaltyPublicController {
  constructor(private readonly loyalty: LoyaltyService) {}

  @Get('lookup')
  async lookup(@Query('phone') phone?: string, @Query('card') card?: string) {
    const account = card
      ? await this.loyalty.getByCardNumber(card)
      : phone
        ? (await this.loyalty.lookupByPhone(phone)).account
        : null;
    if (!account) return { found: false as const };
    return {
      found: true as const,
      cardNumber: account.cardNumber,
      pointsBalance: account.pointsBalance,
      lifetimePointsEarned: account.lifetimePointsEarned,
      status: account.status,
    };
  }
}
