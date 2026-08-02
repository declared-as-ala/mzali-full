import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Product, ProductSchema } from '@/catalog/product.schema';
import { ProductVariantsService } from '@/catalog/product-variants.service';
import { Variant, VariantSchema } from '@/catalog/variant.schema';
import { DatabaseModule } from '@/database/database.module';
import { InvoicesModule } from '@/invoices/invoices.module';
import { OrdersModule } from '@/orders/orders.module';
import { Quote, QuoteSchema } from './quote.schema';
import { QuotesAdminController } from './quotes-admin.controller';
import { QuotesService } from './quotes.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Quote.name, schema: QuoteSchema },
      { name: Product.name, schema: ProductSchema },
      { name: Variant.name, schema: VariantSchema },
    ]),
    DatabaseModule,
    OrdersModule,
    InvoicesModule,
  ],
  controllers: [QuotesAdminController],
  providers: [QuotesService, ProductVariantsService],
  exports: [QuotesService],
})
export class QuotesModule {}
