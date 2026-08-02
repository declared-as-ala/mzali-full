import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CouponsAdminController } from './coupons-admin.controller';
import { CouponsPublicController } from './coupons-public.controller';
import { Coupon, CouponRedemption, CouponRedemptionSchema, CouponSchema } from './coupon.schema';
import { CouponsService } from './coupons.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Coupon.name, schema: CouponSchema },
      { name: CouponRedemption.name, schema: CouponRedemptionSchema },
    ]),
  ],
  controllers: [CouponsAdminController, CouponsPublicController],
  providers: [CouponsService],
  exports: [CouponsService],
})
export class CouponsModule {}
