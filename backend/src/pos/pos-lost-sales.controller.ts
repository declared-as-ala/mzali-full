import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/auth/current-user.decorator';
import { JwtAuthGuard, RequestUser } from '@/auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '@/auth/guards/permissions.guard';
import { LogLostSaleDto } from './dto/lost-sale.dto';
import { PosTerminalGuard, PosRequest } from './guards/pos-terminal.guard';
import { PosLostSalesService } from './pos-lost-sales.service';

@ApiTags('pos/lost-sales')
@ApiBearerAuth()
@Controller('pos/lost-sales')
@UseGuards(JwtAuthGuard, PosTerminalGuard, PermissionsGuard)
export class PosLostSalesController {
  constructor(private readonly lostSales: PosLostSalesService) {}

  /** Same permission as selling — any cashier working the till can log
   *  "a customer wanted this and we didn't have it". Fire-and-forget from
   *  the till's perspective; never blocks or affects the cart. */
  @Post()
  @RequirePermissions('pos.sell')
  async log(@Body() dto: LogLostSaleDto, @CurrentUser() user: RequestUser, @Req() posReq: PosRequest) {
    await this.lostSales.logAttempt(dto.variantId, posReq.posLocationId ?? 'BOUTIQUE', posReq.posTerminalId ?? null, user.userId);
    return { ok: true };
  }
}
