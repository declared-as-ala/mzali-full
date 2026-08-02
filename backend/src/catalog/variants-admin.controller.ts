import { Body, Controller, Get, NotFoundException, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '@/auth/guards/permissions.guard';
import { StockLedgerService } from '@/inventory/stock-ledger.service';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { ProductVariantsService } from './product-variants.service';
import { toVariantContract } from './variant.mapper';

@ApiTags('admin/inventory/variants')
@ApiBearerAuth()
@Controller('admin/inventory/variants')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class VariantsAdminController {
  constructor(
    private readonly variants: ProductVariantsService,
    private readonly ledger: StockLedgerService,
  ) {}

  @Get()
  @RequirePermissions('inventory.read')
  async byProduct(@Query('productId') productId?: string) {
    if (!productId) return [];
    // Every product needs exactly one variant (D7) but generation is lazy —
    // this is the product-form's lookup, so ensure it exists here rather
    // than surfacing "no variant yet" to the admin.
    const doc = (await this.variants.findByProductId(productId)) ?? (await this.variants.generateDefaultVariant(productId));
    return [toVariantContract(doc)];
  }

  @Get(':id')
  @RequirePermissions('inventory.read')
  async get(@Param('id') id: string) {
    const doc = await this.variants.findById(id);
    if (!doc) throw new NotFoundException('Variante introuvable');
    return toVariantContract(doc);
  }

  @Get(':id/stock')
  @RequirePermissions('inventory.read')
  async stock(@Param('id') id: string) {
    const doc = await this.variants.findById(id);
    if (!doc) throw new NotFoundException('Variante introuvable');
    const items = await this.ledger.stockFor(id);
    return items.map((i) => ({
      locationId: i.locationId,
      quantityOnHand: i.quantityOnHand,
      quantityReserved: i.quantityReserved,
      quantityAvailable: i.quantityOnHand - i.quantityReserved,
    }));
  }

  @Patch(':id')
  @RequirePermissions('inventory.adjust')
  async update(@Param('id') id: string, @Body() dto: UpdateVariantDto) {
    const doc = await this.variants.update(id, dto);
    if (!doc) throw new NotFoundException('Variante introuvable');
    return toVariantContract(doc);
  }
}
