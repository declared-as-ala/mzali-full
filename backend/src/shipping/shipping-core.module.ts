import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Order, OrderSchema } from '@/orders/order.schema';
import { AxessService } from './axess.service';
import { FirstDeliveryService } from './first-delivery.service';
import { NavexService } from './navex.service';
import { ShippingService } from './shipping.service';

const ShippingMongoose = MongooseModule.forFeature([{ name: Order.name, schema: OrderSchema }]);

/**
 * Services only — no controllers, no auth-guard dependency. Imported by
 * BOTH the API's ShippingModule (which adds controllers) and the worker's
 * ShippingWorkerModule (which adds the BullMQ processor), so the worker
 * process never has to load JwtAuthGuard/JwtService just to run a queue
 * consumer.
 */
@Module({
  imports: [ShippingMongoose],
  providers: [NavexService, FirstDeliveryService, AxessService, ShippingService],
  exports: [ShippingService, NavexService, FirstDeliveryService, AxessService, ShippingMongoose],
})
export class ShippingCoreModule {}
