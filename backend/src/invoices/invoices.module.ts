import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Product, ProductSchema } from '@/catalog/product.schema';
import { ProductVariantsService } from '@/catalog/product-variants.service';
import { Variant, VariantSchema } from '@/catalog/variant.schema';
import { DatabaseModule } from '@/database/database.module';
import { Invoice, InvoiceSchema } from './invoice.schema';
import { InvoicesAdminController } from './invoices-admin.controller';
import { InvoicesService } from './invoices.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Invoice.name, schema: InvoiceSchema },
      { name: Product.name, schema: ProductSchema },
      { name: Variant.name, schema: VariantSchema },
    ]),
    DatabaseModule,
  ],
  controllers: [InvoicesAdminController],
  providers: [InvoicesService, ProductVariantsService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
