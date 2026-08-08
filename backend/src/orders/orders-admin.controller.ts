import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditService } from '@/audit/audit.service';
import { CurrentUser } from '@/auth/current-user.decorator';
import { AuthedRequest, JwtAuthGuard, RequestUser } from '@/auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '@/auth/guards/permissions.guard';
import { UpdateOrderDto } from './dto/order-update.dto';
import { OrderListQueryDto } from './dto/order-list-query.dto';
import { CheckoutDto } from './dto/checkout.dto';
import { OrdersService } from './orders.service';

@ApiTags('admin/orders')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OrdersAdminController {
  constructor(
    private readonly orders: OrdersService,
    private readonly audit: AuditService,
  ) {}

  @Get('admin/orders')
  @RequirePermissions('orders.read')
  list(@Query() query: OrderListQueryDto) {
    return this.orders.list(query);
  }

  /** Single-round-trip status breakdown for the orders list header/filters
   *  — see OrdersService.counts(). Deliberately ignores `status`/`page`/
   *  `perPage` (it computes every bucket at once) but respects `search`/
   *  `after`/`before`, same scope as list(). */
  @Get('admin/orders/counts')
  @RequirePermissions('orders.read')
  counts(@Query() query: OrderListQueryDto) {
    return this.orders.counts(query);
  }

  @Post('admin/orders')
  @RequirePermissions('orders.write')
  create(@Body() dto: CheckoutDto) {
    return this.orders.create(dto, undefined);
  }

  @Get('admin/order-statuses')
  @RequirePermissions('orders.read')
  statuses() {
    return this.orders.distinctStatuses();
  }

  @Get('admin/customers/orders')
  @RequirePermissions('customers.read')
  customerOrders(@Query('phone') phone: string) {
    return this.orders.ordersByPhone(phone ?? '');
  }

  @Get('admin/orders/:id')
  @RequirePermissions('orders.read')
  async get(@Param('id') id: string) {
    return this.orders.getById(id);
  }

  @Put('admin/orders/:id')
  @RequirePermissions('orders.write')
  update(@Param('id') id: string, @Body() dto: UpdateOrderDto, @CurrentUser() user: RequestUser) {
    return this.orders.update(id, dto, { type: 'employee', id: user.userId, name: user.name });
  }

  @Delete('admin/orders/:id')
  @RequirePermissions('orders.delete')
  async remove(@Param('id') id: string, @CurrentUser() user: RequestUser, @Req() req: AuthedRequest) {
    await this.orders.remove(id);
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: 'order.delete',
      entityType: 'order',
      entityId: id,
      summary: 'Suppression de la commande',
      ip: req.ip,
    });
    return { ok: true };
  }
}
