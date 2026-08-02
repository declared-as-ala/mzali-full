import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ServiceTokenGuard } from '@/auth/guards/service-token.guard';
import { CouponsService } from './coupons.service';
import { ValidateCouponDto } from './dto/coupon.dto';

@ApiTags('coupons')
@Controller('coupons')
@UseGuards(ServiceTokenGuard)
export class CouponsPublicController {
  constructor(private readonly coupons: CouponsService) {}

  @Post('validate')
  validate(@Body() dto: ValidateCouponDto) {
    return this.coupons.validate(dto.code, dto.subtotal, dto.phone);
  }
}
