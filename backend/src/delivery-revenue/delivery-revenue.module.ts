import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditModule } from '@/audit/audit.module';
import { MediaModule } from '@/media/media.module';
import { Order, OrderSchema } from '@/orders/order.schema';
import { DeliveryRevenueAdminController } from './delivery-revenue-admin.controller';
import { DeliveryRevenueExportService } from './delivery-revenue-export.service';
import { DeliveryRevenueService } from './delivery-revenue.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: Order.name, schema: OrderSchema }]), AuditModule, MediaModule],
  controllers: [DeliveryRevenueAdminController],
  providers: [DeliveryRevenueService, DeliveryRevenueExportService],
})
export class DeliveryRevenueModule {}
