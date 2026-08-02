import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/auth/current-user.decorator';
import { JwtAuthGuard, RequestUser } from '@/auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '@/auth/guards/permissions.guard';
import { roleHasPermission } from '@/auth/permissions';
import { StatsService } from './stats.service';

@ApiTags('admin/stats')
@ApiBearerAuth()
@Controller('admin/stats')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class StatsAdminController {
  constructor(private readonly stats: StatsService) {}

  @Get('dashboard')
  @RequirePermissions('stats.read')
  dashboard(@Query('days') days?: string) {
    return this.stats.dashboard(Number(days ?? 30));
  }

  @Get('revenue-series')
  @RequirePermissions('stats.read')
  revenueSeries(@Query('days') days?: string, @Query('granularity') granularity?: string) {
    return this.stats.revenueSeries(Number(days ?? 30), granularity);
  }

  @Get('status-funnel')
  @RequirePermissions('stats.read')
  statusFunnel(@Query('days') days?: string) {
    return this.stats.statusFunnel(Number(days ?? 30));
  }

  @Get('carrier-performance')
  @RequirePermissions('stats.read')
  carrierPerformance(@Query('days') days?: string) {
    return this.stats.carrierPerformance(Number(days ?? 30));
  }

  @Get('coupon-performance')
  @RequirePermissions('stats.read')
  couponPerformance() {
    return this.stats.couponPerformance();
  }

  @Get('geography')
  @RequirePermissions('stats.read')
  geography(@Query('days') days?: string) {
    return this.stats.geography(Number(days ?? 30));
  }

  @Get('pos-daily')
  @RequirePermissions('stats.read')
  posDaily(@Query('days') days?: string) {
    return this.stats.posDaily(Number(days ?? 30));
  }

  @Get('pos-by-cashier')
  @RequirePermissions('stats.read')
  posByCashier(@Query('days') days?: string) {
    return this.stats.posByCashier(Number(days ?? 30));
  }

  @Get('margin')
  @RequirePermissions('stats.read')
  async margin(
    @Query('days') days?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('channel') channel?: string,
    @CurrentUser() user?: RequestUser,
  ) {
    const rows = await this.stats.marginReport(
      days ? Number(days) : 30,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
      channel === 'pos' || channel === 'online' ? channel : 'all',
    );
    if (user && roleHasPermission(user.role, 'inventory.view_cost')) return rows;
    return rows.map(({ purchasePrice: _purchasePrice, totalPurchaseCost: _totalPurchaseCost, profit: _profit, marginPercent: _marginPercent, ...rest }) => rest);
  }

  @Get('discounts')
  @RequirePermissions('stats.read')
  discountReport(@Query('days') days?: string) {
    return this.stats.discountReport(Number(days ?? 30));
  }
}
