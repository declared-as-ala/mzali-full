import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CatalogModule } from '@/catalog/catalog.module';
import { CouponsModule } from '@/coupons/coupons.module';
import { CustomersModule } from '@/customers/customers.module';
import { InventoryModule } from '@/inventory/inventory.module';
import { LoyaltyCoreModule } from '@/loyalty/loyalty-core.module';
import { Order, OrderSchema } from './order.schema';
import { OrdersAdminController } from './orders-admin.controller';
import { OrdersEmployeeController } from './orders-employee.controller';
import { OrdersPublicController } from './orders-public.controller';
import { OrdersService } from './orders.service';

const OrderMongoose = MongooseModule.forFeature([{ name: Order.name, schema: OrderSchema }]);

@Module({
  imports: [OrderMongoose, CatalogModule, InventoryModule, CouponsModule, CustomersModule, LoyaltyCoreModule],
  controllers: [OrdersPublicController, OrdersAdminController, OrdersEmployeeController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
