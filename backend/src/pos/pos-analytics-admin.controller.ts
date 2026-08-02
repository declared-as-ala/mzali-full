import { Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditService } from '@/audit/audit.service';
import { CurrentUser } from '@/auth/current-user.decorator';
import { AuthedRequest, JwtAuthGuard, RequestUser } from '@/auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '@/auth/guards/permissions.guard';
import { roleHasPermission } from '@/auth/permissions';
import {
  CategoryPerformanceQueryDto,
  ExportReportQueryDto,
  PosAnalyticsFilterDto,
  ProductPerformanceQueryDto,
  RevenueSeriesQueryDto,
  resolveDateRange,
} from './dto/pos-analytics.dto';
import { PosAnalyticsFilter, PosAnalyticsService } from './pos-analytics.service';
import { PosAlertsService } from './pos-alerts.service';
import { PosReportExportService } from './pos-report-export.service';

/** true when the caller may see purchase-cost/margin data — mirrors the
 *  `inventory.view_cost` gate StatsService's margin endpoints already use,
 *  so cost visibility rules stay identical across admin and POS reports. */
function canViewCosts(user: RequestUser): boolean {
  return roleHasPermission(user.role, 'pos.analytics.costs');
}

/** Strips purchase-cost/profit/margin fields for callers without
 *  `pos.analytics.costs` — quantities/revenue stay visible, cost data
 *  doesn't, same split the /margin endpoint already enforces. */
function hideProductCosts<T extends { cost: unknown; costUnknown: unknown; profit: unknown; marginPercent: unknown }>(row: T): T {
  return { ...row, cost: null, costUnknown: undefined, profit: null, marginPercent: null };
}
function hideCategoryCosts<T extends { cost: unknown; costUnknown: unknown; profit: unknown; marginPercent: unknown }>(row: T): T {
  return { ...row, cost: null, costUnknown: undefined, profit: null, marginPercent: null };
}

function toFilter(dto: PosAnalyticsFilterDto): PosAnalyticsFilter {
  const { from, to } = resolveDateRange(dto.preset, dto.from, dto.to);
  return {
    from,
    to,
    locationId: dto.locationId,
    terminalId: dto.terminalId,
    registerId: dto.registerId,
    cashierId: dto.cashierId,
  };
}

@ApiTags('admin/pos/analytics')
@ApiBearerAuth()
@Controller('admin/pos/analytics')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('pos.analytics.read')
export class PosAnalyticsAdminController {
  constructor(
    private readonly analytics: PosAnalyticsService,
    private readonly alerts: PosAlertsService,
    private readonly reportExport: PosReportExportService,
    private readonly audit: AuditService,
  ) {}

  @Post('export')
  @RequirePermissions('pos.analytics.export')
  async exportReport(@Query() query: ExportReportQueryDto, @CurrentUser() user: RequestUser, @Req() req: AuthedRequest) {
    const { mediaId } = await this.reportExport.export(query.report, query.format, toFilter(query), canViewCosts(user), user.userId);
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: 'pos.analytics.export',
      entityType: 'media',
      entityId: mediaId,
      summary: `Export ${query.report} (${query.format})`,
      ip: req.ip,
    });
    return { mediaId, downloadUrl: `/api/v1/admin/media/${mediaId}/download` };
  }

  @Get('alerts')
  @RequirePermissions('pos.alerts.read')
  async alertFeed(@Query('lookbackHours') lookbackHours?: string) {
    const hours = lookbackHours ? Number(lookbackHours) : undefined;
    return this.alerts.detect(hours && Number.isFinite(hours) && hours > 0 ? hours : undefined);
  }

  @Get('kpis')
  async kpis(@Query() query: PosAnalyticsFilterDto) {
    return this.analytics.kpis(toFilter(query));
  }

  @Get('margin')
  async margin(@Query() query: PosAnalyticsFilterDto, @CurrentUser() user: RequestUser) {
    if (!canViewCosts(user)) {
      return { revenue: null, cost: null, margin: null, marginPercent: null, costUnknown: true, hidden: true };
    }
    return this.analytics.marginEstimate(toFilter(query));
  }

  @Get('revenue-series')
  async revenueSeries(@Query() query: RevenueSeriesQueryDto) {
    return this.analytics.revenueSeries(toFilter(query), query.granularity);
  }

  @Get('payment-breakdown')
  async paymentBreakdown(@Query() query: PosAnalyticsFilterDto) {
    return this.analytics.paymentBreakdown(toFilter(query));
  }

  @Get('cashiers')
  async cashierPerformance(@Query() query: PosAnalyticsFilterDto) {
    return this.analytics.cashierPerformance(toFilter(query));
  }

  @Get('cashiers/:cashierId/detail')
  async cashierDetail(@Param('cashierId') cashierId: string, @Query() query: PosAnalyticsFilterDto) {
    return this.analytics.cashierDetail(cashierId, toFilter(query));
  }

  @Get('products')
  async topProducts(@Query() query: ProductPerformanceQueryDto, @CurrentUser() user: RequestUser) {
    const rows = await this.analytics.topProducts(toFilter(query), {
      channel: query.channel, sort: query.sort, limit: query.limit, categoryId: query.categoryId,
    });
    return canViewCosts(user) ? rows : rows.map(hideProductCosts);
  }

  @Get('categories')
  async topCategories(@Query() query: CategoryPerformanceQueryDto, @CurrentUser() user: RequestUser) {
    const rows = await this.analytics.topCategories(toFilter(query), query.channel ?? 'all');
    return canViewCosts(user) ? rows : rows.map(hideCategoryCosts);
  }

  @Get('loyalty')
  async loyaltyAnalytics(@Query() query: PosAnalyticsFilterDto) {
    return this.analytics.loyaltyAnalytics(toFilter(query));
  }

  @Get('live-sessions')
  async liveSessions() {
    return this.analytics.liveSessions();
  }

  @Get('lost-sales')
  async lostSales(@Query() query: PosAnalyticsFilterDto) {
    return this.analytics.lostSales(toFilter(query));
  }
}
