import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Product, ProductSchema } from '@/catalog/product.schema';
import { Variant, VariantSchema } from '@/catalog/variant.schema';
import { InventoryCoreModule } from './inventory-core.module';
import { InventoryEventsConsumer } from './inventory-events.consumer';

/**
 * Worker-only: registers Product/Variant schemas directly (not the full
 * CatalogModule, which carries JwtAuthGuard-dependent controllers the
 * worker has no business loading) — same pattern as MigrationModule.
 */
@Module({
  imports: [
    InventoryCoreModule,
    MongooseModule.forFeature([
      { name: Product.name, schema: ProductSchema },
      { name: Variant.name, schema: VariantSchema },
    ]),
  ],
  providers: [InventoryEventsConsumer],
})
export class InventoryEventsWorkerModule {}
