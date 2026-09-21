import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '@/auth/current-user.decorator';
import { JwtAuthGuard, RequestUser } from '@/auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '@/auth/guards/permissions.guard';
import { ActivateMatrixDto, BoutiqueQuantityDto, SetModeDto, SetStockQuantitiesDto, VariantAdjustmentDto } from './variant-stock.dto';
import { VariantStockService } from './variant-stock.service';

@Controller('admin/variant-stock')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class VariantStockController {
  constructor(private readonly stock: VariantStockService) {}
  @Get() @RequirePermissions('inventory.read') list(@Query() query: Record<string, string>) { return this.stock.list(query); }
  @Get('movements') @RequirePermissions('inventory.read') history(@Query() query: Record<string, string>) { return this.stock.history(query); }
  @Get('products/:id') @RequirePermissions('inventory.read') configuration(@Param('id') id: string) { return this.stock.configuration(id); }
  @Post('products/:id') @RequirePermissions('inventory.adjust') activate(@Param('id') id: string, @Body() dto: ActivateMatrixDto, @CurrentUser() user: RequestUser) { return this.stock.activate(id, dto, { type: 'employee', id: user.userId, name: user.name }); }
  @Post('products/:id/add') @RequirePermissions('inventory.adjust') add(@Param('id') id: string, @Body() dto: ActivateMatrixDto, @CurrentUser() user: RequestUser) { return this.stock.addVariants(id, dto, { type: 'employee', id: user.userId, name: user.name }); }
  @Post('products/:id/quantities') @RequirePermissions('inventory.adjust') setQuantities(@Param('id') id: string, @Body() dto: SetStockQuantitiesDto, @CurrentUser() user: RequestUser) { return this.stock.setQuantities(id, dto, { type: 'employee', id: user.userId, name: user.name }); }
  @Post('products/:id/boutique') @RequirePermissions('inventory.adjust') setBoutique(@Param('id') id: string, @Body() dto: BoutiqueQuantityDto, @CurrentUser() user: RequestUser) { return this.stock.setBoutiqueQuantity(id, dto, { type: 'employee', id: user.userId, name: user.name }); }
  @Post('products/:id/mode') @RequirePermissions('inventory.adjust') setMode(@Param('id') id: string, @Body() dto: SetModeDto, @CurrentUser() user: RequestUser) { return this.stock.setMode(id, dto, { type: 'employee', id: user.userId, name: user.name }); }
  @Post('adjust') @RequirePermissions('inventory.adjust') adjust(@Body() dto: VariantAdjustmentDto, @CurrentUser() user: RequestUser) { return this.stock.adjust(dto, { type: 'employee', id: user.userId, name: user.name }); }
}

