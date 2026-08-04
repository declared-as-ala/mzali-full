import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InventoryCoreModule } from '@/inventory/inventory-core.module';
import { MediaModule } from '@/media/media.module';
import { CatalogPublicController } from './catalog-public.controller';
import { CategoriesAdminController } from './categories-admin.controller';
import { CategoriesService } from './categories.service';
import { Category, CategorySchema } from './category.schema';
import { Product, ProductSchema } from './product.schema';
import { ProductsAdminController, ProductsEmployeeController } from './products-admin.controller';
import { ProductsService } from './products.service';
import { ProductVariantsService } from './product-variants.service';
import { Variant, VariantSchema } from './variant.schema';
import { VariantsAdminController } from './variants-admin.controller';

const CatalogMongoose = MongooseModule.forFeature([
  { name: Product.name, schema: ProductSchema },
  { name: Category.name, schema: CategorySchema },
  { name: Variant.name, schema: VariantSchema },
]);

@Module({
  imports: [CatalogMongoose, InventoryCoreModule, MediaModule],
  controllers: [
    CatalogPublicController,
    ProductsAdminController,
    ProductsEmployeeController,
    CategoriesAdminController,
    VariantsAdminController,
  ],
  providers: [ProductsService, CategoriesService, ProductVariantsService],
  exports: [ProductsService, CategoriesService, ProductVariantsService, CatalogMongoose],
})
export class CatalogModule {}
