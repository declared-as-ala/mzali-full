import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Order, OrderSchema } from '@/orders/order.schema';
import { Coupon, CouponRedemption, CouponRedemptionSchema, CouponSchema } from '@/coupons/coupon.schema';
import { Customer, CustomerSchema } from '@/customers/customer.schema';
import { Employee, EmployeeSchema } from '@/users/employee.schema';
import { InventoryModule } from '@/inventory/inventory.module';
import { CatalogModule } from '@/catalog/catalog.module';
import { PosSale, PosSaleSchema } from '@/pos/pos-sale.schema';
import { StatsAdminController } from './stats-admin.controller';
import { StatsService } from './stats.service';

const StatsMongoose = MongooseModule.forFeature([
  { name: Order.name, schema: OrderSchema },
  { name: Customer.name, schema: CustomerSchema },
  { name: Coupon.name, schema: CouponSchema },
  { name: CouponRedemption.name, schema: CouponRedemptionSchema },
  { name: Employee.name, schema: EmployeeSchema },
  { name: PosSale.name, schema: PosSaleSchema },
]);

@Module({
  imports: [StatsMongoose, InventoryModule, CatalogModule],
  controllers: [StatsAdminController],
  providers: [StatsService],
})
export class StatsModule {}
