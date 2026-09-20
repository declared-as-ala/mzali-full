import { VariantStockService } from './variant-stock.service';
import { VariantStockController } from './variant-stock.controller';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CatalogModule } from '@/catalog/catalog.module';
import { PurchaseOrder, PurchaseOrderSchema } from '@/purchase-orders/purchase-order.schema';
import { Alert, AlertSchema } from './alerts/alert.schema';
import { AlertsService } from './alerts/alerts.service';
import { InventoryAdminController } from './inventory-admin.controller';
import { InventoryCoreModule } from './inventory-core.module';
import { InventoryService } from './inventory.service';

@Module({
  imports: [
    InventoryCoreModule,
    CatalogModule,
    MongooseModule.forFeature([
      { name: Alert.name, schema: AlertSchema },
      { name: PurchaseOrder.name, schema: PurchaseOrderSchema },
    ]),
  ],
  controllers: [InventoryAdminController, VariantStockController],
  providers: [InventoryService, AlertsService, VariantStockService],
  exports: [InventoryService, InventoryCoreModule],
})
export class InventoryModule {}
