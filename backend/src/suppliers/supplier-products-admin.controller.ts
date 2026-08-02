import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '@/auth/guards/permissions.guard';
import { CreateSupplierProductDto, ListSupplierProductsQueryDto, UpdateSupplierProductDto } from './dto/supplier-product.dto';
import { toSupplierProductContract } from './supplier-product.mapper';
import { SupplierProductsService } from './supplier-products.service';

@ApiTags('admin/supplier-products')
@ApiBearerAuth()
@Controller('admin/supplier-products')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SupplierProductsAdminController {
  constructor(private readonly products: SupplierProductsService) {}

  @Get()
  @RequirePermissions('purchasing.manage')
  async list(@Query() query: ListSupplierProductsQueryDto) {
    const docs = await this.products.list(query);
    return docs.map(toSupplierProductContract);
  }

  @Get('facets')
  @RequirePermissions('purchasing.manage')
  facets() {
    return this.products.distinctCategoriesAndBrands();
  }

  @Get(':id')
  @RequirePermissions('purchasing.manage')
  async get(@Param('id') id: string) {
    return toSupplierProductContract(await this.products.getById(id));
  }

  @Post()
  @RequirePermissions('purchasing.manage')
  async create(@Body() dto: CreateSupplierProductDto) {
    return toSupplierProductContract(await this.products.create(dto));
  }

  @Patch(':id')
  @RequirePermissions('purchasing.manage')
  async update(@Param('id') id: string, @Body() dto: UpdateSupplierProductDto) {
    return toSupplierProductContract(await this.products.update(id, dto));
  }

  @Delete(':id')
  @RequirePermissions('purchasing.manage')
  async delete(@Param('id') id: string) {
    await this.products.delete(id);
    return { ok: true };
  }
}
