import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { PermissionsGuard, RequirePermissions } from '@/auth/guards/permissions.guard';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { PosRequest, PosTerminalGuard } from './guards/pos-terminal.guard';
import { PosDashboardService } from './pos-dashboard.service';

class TopProductsQueryDto {
  @IsOptional() @IsIn(['today', 'last7', 'thisMonth'])
  period?: 'today' | 'last7' | 'thisMonth';
}

/** The POS terminal's own home-screen dashboard — boutique-scoped (not
 *  cross-store like admin/pos/analytics), so it only needs `pos.sell`, not
 *  an admin permission. See pos-dashboard.service.ts for why this reuses
 *  PosAnalyticsService instead of a parallel aggregation. */
@ApiTags('pos/dashboard')
@ApiBearerAuth()
@Controller('pos/dashboard')
@UseGuards(JwtAuthGuard, PosTerminalGuard, PermissionsGuard)
export class PosDashboardController {
  constructor(private readonly dashboard: PosDashboardService) {}

  @Get('summary')
  @RequirePermissions('pos.sell')
  async summary(@Req() posReq: PosRequest) {
    return this.dashboard.summary(posReq.posLocationId!);
  }

  @Get('top-products')
  @RequirePermissions('pos.sell')
  async topProducts(@Query() query: TopProductsQueryDto, @Req() posReq: PosRequest) {
    return this.dashboard.topProducts(posReq.posLocationId!, query.period ?? 'today');
  }
}
