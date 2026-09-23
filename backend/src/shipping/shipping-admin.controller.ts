import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/auth/current-user.decorator';
import { JwtAuthGuard, RequestUser } from '@/auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '@/auth/guards/permissions.guard';
import { PreviewFirstDeliveryDto, PushShipmentDto } from './dto/push.dto';
import { ShippingService } from './shipping.service';

@ApiTags('admin/shipping')
@ApiBearerAuth()
@Controller('admin/shipping')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ShippingAdminController {
  constructor(private readonly shipping: ShippingService) {}

  @Post('navex')
  @RequirePermissions('shipping.push')
  push_navex(@Body() dto: PushShipmentDto, @CurrentUser() user: RequestUser) {
    return this.shipping.push('navex', dto.orderId, { type: 'employee', id: user.userId, name: user.name }, dto.force);
  }

  @Post('firstdelivery')
  @RequirePermissions('shipping.push')
  push_firstdelivery(@Body() dto: PushShipmentDto, @CurrentUser() user: RequestUser) {
    return this.shipping.push('firstdelivery', dto.orderId, { type: 'employee', id: user.userId, name: user.name }, dto.force, dto.localityId);
  }

  /**
   * Read-only: resolves what First Delivery destination this order would
   * currently send to, so the admin can confirm it (or pick a locality
   * from the candidate list) before an actual carrier push happens.
   */
  @Post('firstdelivery/preview')
  @RequirePermissions('shipping.push')
  preview_firstdelivery(@Body() dto: PreviewFirstDeliveryDto) {
    return this.shipping.previewFirstDeliveryLocality(dto.orderId);
  }

  @Post('axess')
  @RequirePermissions('shipping.push')
  push_axess(@Body() dto: PushShipmentDto, @CurrentUser() user: RequestUser) {
    return this.shipping.push('axess', dto.orderId, { type: 'employee', id: user.userId, name: user.name }, dto.force);
  }
}
