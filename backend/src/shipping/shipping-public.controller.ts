import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ServiceTokenGuard } from '@/auth/guards/service-token.guard';
import { ShippingService } from './shipping.service';

/**
 * First Delivery's public locality directory — Tunisia's governorate →
 * délégation ("Mo3tamadia") → locality breakdown, not sensitive data
 * (the same public administrative divisions any citizen already knows),
 * so it's exposed unauthenticated to both the checkout page (guest
 * customers picking their own exact locality) and the admin/employee
 * consoles (same picker, same data — no reason to duplicate this behind
 * two separately-guarded copies). Only the Next BFF calls this
 * (X-Service-Token) — browsers never hit this API directly, matching
 * CatalogPublicController's pattern.
 */
@ApiTags('shipping')
@Controller('shipping')
@UseGuards(ServiceTokenGuard)
export class ShippingPublicController {
  constructor(private readonly shipping: ShippingService) {}

  @Get('firstdelivery/localities')
  localities(@Query('governorate') governorate: string) {
    return this.shipping.firstDeliveryLocalities(governorate ?? '');
  }
}
