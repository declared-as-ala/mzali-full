import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/auth/current-user.decorator';
import { JwtAuthGuard, RequestUser } from '@/auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '@/auth/guards/permissions.guard';
import { UpdateOrderDto, UpdateStatusDto } from './dto/order-update.dto';
import { OrderListQueryDto } from './dto/order-list-query.dto';
import { ALLOWED_FOR_EMPLOYEE } from './order-status';
import { OrdersService } from './orders.service';

@ApiTags('employee/orders')
@ApiBearerAuth()
@Controller('employee/orders')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OrdersEmployeeController {
  constructor(private readonly orders: OrdersService) {}

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

  private async requireOrder(id: string) {
    const order = await this.orders.getById(id);
    if (!order) throw new NotFoundException('Commande introuvable');
    return order;
  }
}
