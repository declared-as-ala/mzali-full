import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DatabaseModule } from '@/database/database.module';
import { SupplierProduct, SupplierProductSchema } from './supplier-product.schema';
import { SupplierPurchaseOrder, SupplierPurchaseOrderSchema } from './supplier-purchase-order.schema';
import { Supplier, SupplierSchema } from './supplier.schema';
// Kept registered though unused by any service now — the collection still
// holds real historical pricing data from the old ERP purchasing workflow
// and must not be dropped (see the supplier-management simplification).
import { SupplierVariantOffer, SupplierVariantOfferSchema } from './supplier-variant-offer.schema';
import { SupplierProductsAdminController } from './supplier-products-admin.controller';
import { SupplierProductsService } from './supplier-products.service';
import { SupplierPurchaseOrdersAdminController } from './supplier-purchase-orders-admin.controller';
import { SupplierPurchaseOrdersService } from './supplier-purchase-orders.service';
import { SuppliersAdminController } from './suppliers-admin.controller';
import { SuppliersService } from './suppliers.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Supplier.name, schema: SupplierSchema },
      { name: SupplierVariantOffer.name, schema: SupplierVariantOfferSchema },
      { name: SupplierProduct.name, schema: SupplierProductSchema },
      { name: SupplierPurchaseOrder.name, schema: SupplierPurchaseOrderSchema },
    ]),
    DatabaseModule,
  ],
  controllers: [SuppliersAdminController, SupplierProductsAdminController, SupplierPurchaseOrdersAdminController],
  providers: [SuppliersService, SupplierProductsService, SupplierPurchaseOrdersService],
  exports: [SuppliersService, SupplierProductsService, SupplierPurchaseOrdersService],
})
export class SuppliersModule {}
