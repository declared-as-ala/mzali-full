import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';
import type { DeliveryRevenueProviderKey } from '@contracts';
import { CurrentUser } from '@/auth/current-user.decorator';
import { JwtAuthGuard, RequestUser } from '@/auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '@/auth/guards/permissions.guard';
import { DeliveryRevenueService } from './delivery-revenue.service';
import { DeliveryRevenueExportDto, DeliveryRevenueExportService } from './delivery-revenue-export.service';

class MarkDeliveredDto {
  @IsString() @MinLength(3) reason!: string;
}

/** "Chiffre d'affaires commandes" — see delivery-revenue.service.ts's
 *  doc for what makes this different from every other revenue number in
 *  the admin console. Read endpoints reuse the existing `orders.read`/
 *  `orders.export` permissions (this IS order revenue reporting, not a
 *  new domain) — the manual-override endpoint requires `orders.write`. */
@ApiTags('admin/delivery-revenue')
@ApiBearerAuth()
@Controller('admin/delivery-revenue')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DeliveryRevenueAdminController {
  constructor(
    private readonly revenue: DeliveryRevenueService,
    private readonly export_: DeliveryRevenueExportService,
  ) {}

  @Get('summary')
  @RequirePermissions('orders.read')
  summary(@Query('preset') preset?: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.revenue.summary(preset as never, from, to);
  }

  @Get('by-day')
  @RequirePermissions('orders.read')
  byDay(@Query('preset') preset?: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.revenue.byDay(preset as never, from, to);
  }

  @Get('by-provider')
  @RequirePermissions('orders.read')
  byProvider(@Query('preset') preset?: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.revenue.byProvider(preset as never, from, to);
  }

  @Get('orders')
  @RequirePermissions('orders.read')
  orders(
    @Query('preset') preset?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('provider') provider?: string,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ) {
    return this.revenue.orderList({
      preset: preset as never,
      from,
      to,
      provider: provider as DeliveryRevenueProviderKey | undefined,
      page: page ? Number(page) : undefined,
      perPage: perPage ? Number(perPage) : undefined,
    });
  }

  @Post('orders/:id/mark-delivered')
  @RequirePermissions('orders.write')
  async markDelivered(@Param('id') id: string, @Body() dto: MarkDeliveredDto, @CurrentUser() user: RequestUser) {
    await this.revenue.markDelivered(id, dto.reason, { type: 'employee', id: user.userId, name: user.name });
    return { ok: true };
  }

  @Post('export')
  @RequirePermissions('orders.export')
  async export(@Body() dto: DeliveryRevenueExportDto) {
    const { mediaId } = await this.export_.export(dto);
    return { mediaId, downloadUrl: `/api/v1/admin/media/${mediaId}/download` };
  }
}
