import { Module } from '@nestjs/common';
import { CarrierPushProcessor } from './carrier-push.processor';
import { ShippingCoreModule } from './shipping-core.module';

/** Worker-only: services + BullMQ processor, no HTTP controllers/guards. */
@Module({
  imports: [ShippingCoreModule],
  providers: [CarrierPushProcessor],
})
export class ShippingWorkerModule {}
