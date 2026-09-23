import { Module } from '@nestjs/common';
import { ShippingAdminController } from './shipping-admin.controller';
import { ShippingCoreModule } from './shipping-core.module';
import { ShippingEmployeeController } from './shipping-employee.controller';
import { ShippingPublicController } from './shipping-public.controller';

/** API-only: adds the HTTP controllers on top of ShippingCoreModule. */
@Module({
  imports: [ShippingCoreModule],
  controllers: [ShippingAdminController, ShippingEmployeeController, ShippingPublicController],
})
export class ShippingModule {}
