import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditService } from '@/audit/audit.service';
import { CurrentUser } from '@/auth/current-user.decorator';
import { AuthedRequest, JwtAuthGuard, RequestUser } from '@/auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '@/auth/guards/permissions.guard';
import { CheckoutDto } from './dto/checkout.dto';
import { UpdateOrderDto, UpdateStatusDto } from './dto/order-update.dto';
import { OrderListQueryDto } from './dto/order-list-query.dto';
import { ALLOWED_FOR_EMPLOYEE } from './order-status';
import { OrdersService } from './orders.service';

@ApiTags('employee/orders')
@ApiBearerAuth()
@Controller('employee/orders')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OrdersEmployeeController {
  constructor(
    private readonly orders: OrdersService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions('orders.read')
  list(@Query() query: OrderListQueryDto) {
    return this.orders.list(query);
  }

  @Get('statuses')
  @RequirePermissions('orders.read')
  statuses() {
    return Array.from(ALLOWED_FOR_EMPLOYEE);
  }

  @Get(':id')
  @RequirePermissions('orders.read')
  async get(@Param('id') id: string) {
    return this.requireOrder(id);
  }

  @Post()
  @RequirePermissions('orders.write')
  create(@Body() dto: CheckoutDto) {
    return this.orders.create(dto, undefined);
  }

  @Put(':id')
  @RequirePermissions('orders.write')
  async update(@Param('id') id: string, @Body() dto: UpdateOrderDto, @CurrentUser() user: RequestUser) {
    await this.requireOrder(id);
    return this.orders.update(id, dto, { type: 'employee', id: user.userId, name: user.name });
  }

  @Put(':id/status')
  @RequirePermissions('orders.write')
  async updateStatus(@Param('id') id: string, @Body() dto: UpdateStatusDto, @CurrentUser() user: RequestUser) {
    await this.requireOrder(id);
    if (!dto.status || !ALLOWED_FOR_EMPLOYEE.has(dto.status)) {
      throw new BadRequestException('Statut non autorisé');
    }
    return this.orders.changeStatus(id, dto.status, { type: 'employee', id: user.userId, name: user.name });
  }

  @Delete(':id')
  @RequirePermissions('orders.delete')
  async remove(@Param('id') id: string, @CurrentUser() user: RequestUser, @Req() req: AuthedRequest) {
    await this.requireOrder(id);
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

  private async requireOrder(id: string) {
    const order = await this.orders.getById(id);
    if (!order) throw new NotFoundException('Commande introuvable');
    return order;
  }
}
