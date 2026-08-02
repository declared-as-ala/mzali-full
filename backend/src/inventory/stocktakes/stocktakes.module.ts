import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LocationsCoreModule } from '@/catalog/locations-core.module';
import { Product, ProductSchema } from '@/catalog/product.schema';
import { ProductVariantsService } from '@/catalog/product-variants.service';
import { Variant, VariantSchema } from '@/catalog/variant.schema';
import { DatabaseModule } from '@/database/database.module';
import { InventoryCoreModule } from '../inventory-core.module';
import { Stocktake, StocktakeSchema } from './stocktake.schema';
import { StocktakesAdminController } from './stocktakes-admin.controller';
import { StocktakesService } from './stocktakes.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Stocktake.name, schema: StocktakeSchema },
      { name: Product.name, schema: ProductSchema },
      { name: Variant.name, schema: VariantSchema },
    ]),
    LocationsCoreModule,
    InventoryCoreModule,
    DatabaseModule,
  ],
  controllers: [StocktakesAdminController],
  providers: [StocktakesService, ProductVariantsService],
  exports: [StocktakesService],
})
export class StocktakesModule {}
