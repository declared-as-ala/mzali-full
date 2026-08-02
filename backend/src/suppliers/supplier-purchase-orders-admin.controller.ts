import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Queue } from 'bullmq';
import { CurrentUser } from '@/auth/current-user.decorator';
import { JwtAuthGuard, RequestUser } from '@/auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '@/auth/guards/permissions.guard';
import { QUEUES } from '@/jobs/queues';
import { CreateSupplierPurchaseOrderDto, UpdateSupplierPurchaseOrderStatusDto } from './dto/supplier-purchase-order.dto';
import { SuppliersService } from './suppliers.service';
import { toSupplierPurchaseOrderContract } from './supplier-purchase-order.mapper';
import { SupplierPurchaseOrdersService } from './supplier-purchase-orders.service';

@ApiTags('admin/supplier-purchase-orders')
@ApiBearerAuth()
@Controller('admin/supplier-purchase-orders')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SupplierPurchaseOrdersAdminController {
  constructor(
    private readonly orders: SupplierPurchaseOrdersService,
    private readonly suppliers: SuppliersService,
    @InjectQueue(QUEUES.MEDIA_PROCESSING) private readonly pdfQueue: Queue,
  ) {}

  @Get()
  @RequirePermissions('purchasing.manage')
  async list(@Query('supplierId') supplierId?: string) {
    const docs = await this.orders.list(supplierId);
    return this.toContracts(docs);
  }

  @Get(':id')
  @RequirePermissions('purchasing.manage')
  async get(@Param('id') id: string) {
    const doc = await this.orders.getById(id);
    const [contract] = await this.toContracts([doc]);
    return contract;
  }

  @Post()
  @RequirePermissions('purchasing.manage')
  async create(@Body() dto: CreateSupplierPurchaseOrderDto, @CurrentUser() user: RequestUser) {
    const doc = await this.orders.create(dto, { type: 'employee', id: user.userId, name: user.name });
    await this.pdfQueue.add('supplier-po.generate-pdf', { documentType: 'supplier-purchase-order', documentId: doc.id });
    const [contract] = await this.toContracts([doc]);
    return contract;
  }

  @Patch(':id/status')
  @RequirePermissions('purchasing.manage')
  async setStatus(@Param('id') id: string, @Body() dto: UpdateSupplierPurchaseOrderStatusDto) {
    const doc = await this.orders.setStatus(id, dto.status);
    const [contract] = await this.toContracts([doc]);
    return contract;
  }

  private async toContracts(docs: Awaited<ReturnType<SupplierPurchaseOrdersService['list']>>) {
    const supplierIds = [...new Set(docs.map((d) => d.supplierId))];
    const names = await this.suppliers.namesByIds(supplierIds);
    return docs.map((d) => toSupplierPurchaseOrderContract(d, names.get(d.supplierId) ?? d.supplierId));
  }
}
