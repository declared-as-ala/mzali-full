import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Category, CategorySchema } from '@/catalog/category.schema';
import { CategoriesService } from '@/catalog/categories.service';
import { LocationsCoreModule } from '@/catalog/locations-core.module';
import { Product, ProductSchema } from '@/catalog/product.schema';
import { ProductVariantsService } from '@/catalog/product-variants.service';
import { ProductsService } from '@/catalog/products.service';
import { Variant, VariantSchema } from '@/catalog/variant.schema';
import { Customer, CustomerSchema } from '@/customers/customer.schema';
import { CustomersService } from '@/customers/customers.service';
import { InventoryCoreModule } from '@/inventory/inventory-core.module';
import { LoyaltyCoreModule } from '@/loyalty/loyalty-core.module';
import { Setting, SettingSchema } from '@/settings/settings.schema';
import { SettingsService } from '@/settings/settings.service';
import { PosCashMovement, PosCashMovementSchema } from './pos-cash-movement.schema';
import { PosCashierSession, PosCashierSessionSchema } from './pos-cashier-session.schema';
import { PosCatalogService } from './pos-catalog.service';
import { PosEventsService } from './pos-events.service';
import { PosLostSale, PosLostSaleSchema } from './pos-lost-sale.schema';
import { PosPayment, PosPaymentSchema } from './pos-payment.schema';
import { PosRegister, PosRegisterSchema } from './pos-register.schema';
import { PosSale, PosSaleSchema } from './pos-sale.schema';
import { PosSalesService } from './pos-sales.service';
import { PosSessionsService } from './pos-sessions.service';
import { PosTerminal, PosTerminalSchema } from './pos-terminal.schema';
import { PosTerminalsService } from './pos-terminals.service';

const PosMongoose = MongooseModule.forFeature([
  { name: PosTerminal.name, schema: PosTerminalSchema },
  { name: PosRegister.name, schema: PosRegisterSchema },
  { name: PosSale.name, schema: PosSaleSchema },
  { name: PosCashierSession.name, schema: PosCashierSessionSchema },
  { name: PosPayment.name, schema: PosPaymentSchema },
  { name: PosCashMovement.name, schema: PosCashMovementSchema },
  { name: PosLostSale.name, schema: PosLostSaleSchema },
  // Registered directly (not by importing CatalogModule/CustomersModule,
  // which have HTTP controllers guarded by JwtAuthGuard) so this module
  // stays safe for a future worker consumer — same pattern as
  // MigrationModule and ShippingCoreModule.
  { name: Product.name, schema: ProductSchema },
  { name: Category.name, schema: CategorySchema },
  { name: Variant.name, schema: VariantSchema },
  { name: Customer.name, schema: CustomerSchema },
  { name: Setting.name, schema: SettingSchema },
]);

@Module({
  imports: [PosMongoose, LocationsCoreModule, InventoryCoreModule, LoyaltyCoreModule],
  providers: [
    ProductsService,
    CategoriesService,
    ProductVariantsService,
    CustomersService,
    SettingsService,
    PosTerminalsService,
    PosCatalogService,
    PosSalesService,
    PosSessionsService,
    PosEventsService,
  ],
  exports: [
    PosMongoose,
    LocationsCoreModule,
    InventoryCoreModule,
    LoyaltyCoreModule,
    ProductsService,
    CategoriesService,
    ProductVariantsService,
    CustomersService,
    SettingsService,
    PosTerminalsService,
    PosCatalogService,
    PosSalesService,
    PosSessionsService,
    PosEventsService,
  ],
})
export class PosCoreModule {}
