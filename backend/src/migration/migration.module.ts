import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Category, CategorySchema } from '@/catalog/category.schema';
import { Location, LocationSchema } from '@/catalog/location.schema';
import { Product, ProductSchema } from '@/catalog/product.schema';
import { ProductVariantsService } from '@/catalog/product-variants.service';
import { Variant, VariantSchema } from '@/catalog/variant.schema';
import { Customer, CustomerSchema } from '@/customers/customer.schema';
import { StockItem, StockItemSchema } from '@/inventory/stock-item.schema';
import { StockMovement, StockMovementSchema } from '@/inventory/stock-movement.schema';
import { Media, MediaSchema } from '@/media/media.schema';
import { MediaService } from '@/media/media.service';
import { minioClientProvider } from '@/media/minio.provider';
import { Order, OrderSchema } from '@/orders/order.schema';
import { Setting, SettingSchema } from '@/settings/settings.schema';
import { SettingsService } from '@/settings/settings.service';
import { SupplierVariantOffer, SupplierVariantOfferSchema } from '@/suppliers/supplier-variant-offer.schema';
import { Employee, EmployeeSchema } from '@/users/employee.schema';
import { LegacyMapping, LegacyMappingSchema } from './legacy-mapping.schema';
import { LegacyMappingService } from './legacy-mapping.service';
import { LegacyFilesReader } from './legacy-files.reader';
import { WooClientService } from './woo-client.service';
import { MigrateAllCommand } from './commands/migrate-all.command';
import { MigrateCategoriesCommand } from './commands/migrate-categories.command';
import { MigrateCustomersCommand } from './commands/migrate-customers.command';
import { MigrateEmployeesCommand } from './commands/migrate-employees.command';
import { MigrateGenerateVariantsCommand } from './commands/migrate-generate-variants.command';
import { MigrateInventoryFoundationCommand } from './commands/migrate-inventory-foundation.command';
import { MigrateMediaCommand } from './commands/migrate-media.command';
import { MigrateOrdersCommand } from './commands/migrate-orders.command';
import { MigrateProductsCommand } from './commands/migrate-products.command';
import { MigratePurchasePricesCommand } from './commands/migrate-purchase-prices.command';
import { MigrateSeedLocationsCommand } from './commands/migrate-seed-locations.command';
import { MigrateSettingsCommand } from './commands/migrate-settings.command';
import { MigrateVerifyCommand } from './commands/migrate-verify.command';
import { VerifyInventoryFoundationCommand } from './commands/verify-inventory-foundation.command';

/**
 * Self-contained: registers every schema it needs directly rather than
 * importing the feature modules (Catalog/Inventory/Orders/Customers/
 * Settings/Media all have HTTP controllers guarded by JwtAuthGuard, which
 * needs AuthModule — never loaded by the CLI process). Same pattern as the
 * Shipping core/API split from TASK-03; see progress.md for the postmortem.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Category.name, schema: CategorySchema },
      { name: Product.name, schema: ProductSchema },
      { name: Variant.name, schema: VariantSchema },
      { name: Location.name, schema: LocationSchema },
      { name: Media.name, schema: MediaSchema },
      { name: StockItem.name, schema: StockItemSchema },
      { name: StockMovement.name, schema: StockMovementSchema },
      { name: Employee.name, schema: EmployeeSchema },
      { name: Order.name, schema: OrderSchema },
      { name: Customer.name, schema: CustomerSchema },
      { name: Setting.name, schema: SettingSchema },
      { name: LegacyMapping.name, schema: LegacyMappingSchema },
      { name: SupplierVariantOffer.name, schema: SupplierVariantOfferSchema },
    ]),
  ],
  providers: [
    WooClientService,
    LegacyMappingService,
    LegacyFilesReader,
    minioClientProvider,
    MediaService,
    SettingsService,
    ProductVariantsService,
    MigrateCategoriesCommand,
    MigrateMediaCommand,
    MigrateProductsCommand,
    MigrateEmployeesCommand,
    MigrateOrdersCommand,
    MigratePurchasePricesCommand,
    MigrateCustomersCommand,
    MigrateSettingsCommand,
    MigrateVerifyCommand,
    MigrateAllCommand,
    MigrateSeedLocationsCommand,
    MigrateGenerateVariantsCommand,
    MigrateInventoryFoundationCommand,
    VerifyInventoryFoundationCommand,
  ],
})
export class MigrationModule {}
