import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '@/auth/guards/permissions.guard';
import { CreateSupplierDto, UpdateSupplierDto } from './dto/supplier.dto';
import { toSupplierContract } from './supplier.mapper';
import { SupplierProductsService } from './supplier-products.service';
import { SupplierPurchaseOrdersService } from './supplier-purchase-orders.service';
import { SuppliersService } from './suppliers.service';

@ApiTags('admin/suppliers')
@ApiBearerAuth()
@Controller('admin/suppliers')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SuppliersAdminController {
  constructor(
    private readonly suppliers: SuppliersService,
    private readonly supplierProducts: SupplierProductsService,
    private readonly purchaseOrders: SupplierPurchaseOrdersService,
  ) {}

  /** List with the stats the module's spec calls for: total catalog
   *  products, total POs, last PO date — computed here so the admin page
   *  never has to N+1 fetch them per supplier. */
  @Get()
  @RequirePermissions('purchasing.manage')
  async list() {
    const docs = await this.suppliers.list();
    const ids = docs.map((d) => d.id);
    const [productCounts, poCounts, lastPoDates] = await Promise.all([
      this.supplierProducts.countBySupplier(ids),
      this.purchaseOrders.countBySupplier(ids),
      this.purchaseOrders.lastBySupplier(ids),
    ]);
    return docs.map((d) => ({
      ...toSupplierContract(d),
      totalProducts: productCounts.get(d.id) ?? 0,
      totalPurchaseOrders: poCounts.get(d.id) ?? 0,
      lastPurchaseOrderAt: lastPoDates.get(d.id)?.toISOString() ?? null,
    }));
  }

  @Get(':id')
  @RequirePermissions('purchasing.manage')
  async get(@Param('id') id: string) {
    return toSupplierContract(await this.suppliers.getById(id));
  }

  @Post()
  @RequirePermissions('purchasing.manage')
  async create(@Body() dto: CreateSupplierDto) {
    return toSupplierContract(await this.suppliers.create(dto));
  }

  @Patch(':id')
  @RequirePermissions('purchasing.manage')
  async update(@Param('id') id: string, @Body() dto: UpdateSupplierDto) {
    return toSupplierContract(await this.suppliers.update(id, dto));
  }

  @Delete(':id')
  @RequirePermissions('purchasing.manage')
  async delete(@Param('id') id: string) {
    await this.suppliers.delete(id);
    return { ok: true };
  }

  @Post('bulk-delete')
  @RequirePermissions('purchasing.manage')
  async bulkDelete(@Body() body: { ids: string[] }) {
    const count = await this.suppliers.deleteMany(body.ids || []);
    return { count };
  }
}
