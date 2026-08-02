import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';
import { ServiceTokenGuard } from '@/auth/guards/service-token.guard';
import { RateLimitGuard } from '@/common/rate-limit.guard';
import { PosTerminalsService } from './pos-terminals.service';

class RequestPairingDto {
  @IsString() @MinLength(8) deviceFingerprint!: string;
}

/**
 * Called by the POS app's own BFF (server-side), never by a browser
 * directly — same ServiceTokenGuard pattern as the storefront's public
 * checkout endpoints. Still the one genuinely public-ish surface in the
 * whole POS API (a leaked/forged service token, or a compromised device
 * hammering its own legitimate BFF, could otherwise brute-force pairing
 * codes with no limit) — rate-limited per source IP on top of the
 * service-token gate.
 */
@ApiTags('pos/terminals')
@Controller('pos/terminals')
@UseGuards(ServiceTokenGuard)
export class PosTerminalsController {
  constructor(private readonly terminals: PosTerminalsService) {}

  @Post('pairing')
  @UseGuards(RateLimitGuard(10, 60))
  requestPairing(@Body() dto: RequestPairingDto) {
    return this.terminals.requestPairing(dto.deviceFingerprint);
  }

  @Get('pairing/:code')
  @UseGuards(RateLimitGuard(60, 60))
  checkPairing(@Param('code') code: string) {
    return this.terminals.checkPairing(code);
  }
}
