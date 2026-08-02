import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditService } from '@/audit/audit.service';
import { CurrentUser } from '@/auth/current-user.decorator';
import { AuthedRequest, JwtAuthGuard, RequestUser } from '@/auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '@/auth/guards/permissions.guard';
import { AlertsService } from './alerts/alerts.service';
import { AdjustStockDto } from './dto/adjust.dto';
import { InventoryService } from './inventory.service';

@ApiTags('admin/inventory')
@ApiBearerAuth()
@Controller('admin/inventory')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InventoryAdminController {
  constructor(
    private readonly inventory: InventoryService,
    private readonly audit: AuditService,
    private readonly alerts: AlertsService,
  ) {}

  @Get('alerts')
  @RequirePermissions('inventory.read')
  async listAlerts() {
    const docs = await this.alerts.listActive();
    return docs.map((a) => ({
      id: a.id,
      type: a.type,
      variantId: a.variantId,
      locationId: a.locationId,
      productId: a.productId,
      productName: a.productName,
      available: a.available,
      threshold: a.threshold,
      negativeStock: a.negativeStock,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    }));
  }

  @Get()
  @RequirePermissions('inventory.read')
  list(
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
    @Query('search') search?: string,
    @Query('lowStock') lowStock?: string,
  ) {
    return this.inventory.list(
      page ? Number(page) : undefined,
      perPage ? Number(perPage) : undefined,
      search,
      lowStock === 'true',
    );
  }

  @Get('movements/:productId')
  @RequirePermissions('inventory.read')
  movements(
    @Param('productId') productId: string,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ) {
    return this.inventory.movementsFor(productId, page ? Number(page) : undefined, perPage ? Number(perPage) : undefined);
  }

  @Post('adjust')
  @RequirePermissions('inventory.adjust')
  async adjust(
    @Body() dto: AdjustStockDto,
    @CurrentUser() user: RequestUser,
    @Req() req: AuthedRequest,
  ) {
    await this.inventory.adjust(dto.productId, dto.qty, dto.reason, {
      type: 'employee',
      id: user.userId,
      name: user.name,
    }, undefined, dto.locationId);
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: 'inventory.adjust',
      entityType: 'product',
      entityId: dto.productId,
      summary: `Ajustement de stock (${dto.qty > 0 ? '+' : ''}${dto.qty}) — ${dto.reason}`,
      after: { qty: dto.qty, reason: dto.reason },
      ip: req.ip,
    });
    return { ok: true };
  }
}
