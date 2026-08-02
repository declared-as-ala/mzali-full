import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LocationsCoreModule } from '@/catalog/locations-core.module';
import { Product, ProductSchema } from '@/catalog/product.schema';
import { ProductVariantsService } from '@/catalog/product-variants.service';
import { Variant, VariantSchema } from '@/catalog/variant.schema';
import { DatabaseModule } from '@/database/database.module';
import { InventoryCoreModule } from '../inventory-core.module';
import { StockTransfer, StockTransferSchema } from './stock-transfer.schema';
import { TransfersAdminController } from './transfers-admin.controller';
import { TransfersService } from './transfers.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: StockTransfer.name, schema: StockTransferSchema },
      { name: Product.name, schema: ProductSchema },
      { name: Variant.name, schema: VariantSchema },
    ]),
    LocationsCoreModule,
    InventoryCoreModule,
    DatabaseModule,
  ],
  controllers: [TransfersAdminController],
  providers: [TransfersService, ProductVariantsService],
  exports: [TransfersService],
})
export class TransfersModule {}
