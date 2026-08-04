import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/auth/current-user.decorator';
import { JwtAuthGuard, RequestUser } from '@/auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '@/auth/guards/permissions.guard';
import { PushShipmentDto } from './dto/push.dto';
import { ShippingService } from './shipping.service';

/** Matches the legacy scope: employees may only manually push navex/firstdelivery (never axess). */
@ApiTags('employee/shipping')
@ApiBearerAuth()
@Controller('employee/shipping')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ShippingEmployeeController {
  constructor(private readonly shipping: ShippingService) {}

  @Post('navex')
  @RequirePermissions('shipping.push')
  pushNavex(@Body() dto: PushShipmentDto, @CurrentUser() user: RequestUser) {
    return this.shipping.push('navex', dto.orderId, { type: 'employee', id: user.userId, name: user.name });
  }

  @Post('firstdelivery')
  @RequirePermissions('shipping.push')
  pushFirstDelivery(@Body() dto: PushShipmentDto, @CurrentUser() user: RequestUser) {
    return this.shipping.push('firstdelivery', dto.orderId, { type: 'employee', id: user.userId, name: user.name });
  }
}
