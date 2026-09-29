import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '@/auth/current-user.decorator';
import { JwtAuthGuard, RequestUser } from '@/auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '@/auth/guards/permissions.guard';
import { ActivateMatrixDto, SaveStockDto, VariantAdjustmentDto } from './variant-stock.dto';
import { VariantStockService } from './variant-stock.service';

const actorOf = (user: RequestUser) => ({ type: 'employee' as const, id: user.userId, name: user.name });

/** Stock administration. There is ONE inventory (DEPOT): no location or mode in any of these routes. */
@Controller('admin/variant-stock')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class VariantStockController {
  constructor(private readonly stock: VariantStockService) {}
  @Get() @RequirePermissions('inventory.read') overview(@Query() query: Record<string, string>) { return this.stock.overview(query); }
  @Get('details') @RequirePermissions('inventory.read') details() { return this.stock.details(); }
  @Get('movements') @RequirePermissions('inventory.read') history(@Query() query: Record<string, string>) { return this.stock.history(query); }
  @Get('products/:id') @RequirePermissions('inventory.read') configuration(@Param('id') id: string) { return this.stock.configuration(id); }
  /** Turns a product without variants into one tracked per exact variant (explicit allocation). */
  @Post('products/:id') @RequirePermissions('inventory.adjust') activate(@Param('id') id: string, @Body() dto: ActivateMatrixDto, @CurrentUser() user: RequestUser) { return this.stock.activate(id, dto, actorOf(user)); }
  @Post('products/:id/add') @RequirePermissions('inventory.adjust') add(@Param('id') id: string, @Body() dto: ActivateMatrixDto, @CurrentUser() user: RequestUser) { return this.stock.addVariants(id, dto, actorOf(user)); }
  /** The one save behind the adjustment modal: quantities + availability, atomically. */
  @Post('products/:id/stock') @RequirePermissions('inventory.adjust') save(@Param('id') id: string, @Body() dto: SaveStockDto, @CurrentUser() user: RequestUser) { return this.stock.saveStock(id, dto, actorOf(user)); }
  @Post('adjust') @RequirePermissions('inventory.adjust') adjust(@Body() dto: VariantAdjustmentDto, @CurrentUser() user: RequestUser) { return this.stock.adjust(dto, actorOf(user)); }
}
