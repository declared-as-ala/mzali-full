import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditService } from '@/audit/audit.service';
import { CurrentUser } from '@/auth/current-user.decorator';
import { AuthedRequest, JwtAuthGuard, RequestUser } from '@/auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '@/auth/guards/permissions.guard';
import { CreateProductDto, ReorderProductsDto, UpdateProductDto } from './dto/product.dto';
import { ProductListQueryDto } from './dto/product-query.dto';
import { ProductsService } from './products.service';

@ApiTags('admin/products')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProductsAdminController {
  constructor(
    private readonly products: ProductsService,
    private readonly audit: AuditService,
  ) {}

  @Get('admin/products')
  @RequirePermissions('products.read')
  list(@Query() query: ProductListQueryDto) {
    return this.products.list(query, false);
  }

  @Get('admin/products/picker')
  @RequirePermissions('products.read')
  picker() {
    return this.products.picker();
  }

  @Get('admin/products/:id')
  @RequirePermissions('products.read')
  get(@Param('id') id: string) {
    return this.products.getById(id);
  }

  @Post('admin/products')
  @RequirePermissions('products.write')
  async create(
    @Body() dto: CreateProductDto,
    @CurrentUser() user: RequestUser,
    @Req() req: AuthedRequest,
  ) {
    const created = await this.products.create(dto);
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: 'product.create',
      entityType: 'product',
      entityId: created.id,
      summary: `Création du produit ${created.name}`,
      ip: req.ip,
    });
    return created;
  }

  @Put('admin/products/:id')
  @RequirePermissions('products.write')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: RequestUser,
    @Req() req: AuthedRequest,
  ) {
    const updated = await this.products.update(id, dto);
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: 'product.update',
      entityType: 'product',
      entityId: id,
      summary: `Mise à jour du produit ${updated.name}`,
      ip: req.ip,
    });
    return updated;
  }

  @Post('admin/products/reorder')
  @RequirePermissions('products.write')
  async reorder(@Body() dto: ReorderProductsDto) {
    await this.products.reorder(dto.items);
    return { ok: true };
  }

  @Delete('admin/products/:id')
  @RequirePermissions('products.write')
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Req() req: AuthedRequest,
  ) {
    await this.products.remove(id);
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: 'product.delete',
      entityType: 'product',
      entityId: id,
      summary: `Suppression (archivage) du produit ${id}`,
      ip: req.ip,
    });
    return { ok: true };
  }
}

/** Read-only product access for employees (order drawer / picker). */
@ApiTags('employee/products')
@ApiBearerAuth()
@Controller('employee/products')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProductsEmployeeController {
  constructor(private readonly products: ProductsService) {}

  @Get('picker')
  @RequirePermissions('products.read')
  picker() {
    return this.products.picker();
  }

  @Get(':id')
  @RequirePermissions('products.read')
  get(@Param('id') id: string) {
    return this.products.getById(id);
  }
}
