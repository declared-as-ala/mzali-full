import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Media, MediaSchema } from '@/media/media.schema';
import { MediaService } from '@/media/media.service';
import { minioClientProvider } from '@/media/minio.provider';
import { SettingsCoreModule } from '@/settings/settings-core.module';
import { Invoice, InvoiceSchema } from '@/invoices/invoice.schema';
import { Quote, QuoteSchema } from '@/quotes/quote.schema';
import { Supplier, SupplierSchema } from '@/suppliers/supplier.schema';
import { SupplierPurchaseOrder, SupplierPurchaseOrderSchema } from '@/suppliers/supplier-purchase-order.schema';
import { DocumentPdfService } from './document-pdf.service';
import { DocumentsPdfProcessor } from './documents-pdf.processor';

/**
 * Worker-only: registers Quote/Invoice/Media schemas + MediaService/MinIO
 * client directly, not the full QuotesModule/InvoicesModule/MediaModule
 * (all of which carry JwtAuthGuard-dependent controllers the worker has
 * no business loading) — same pattern as every other worker module in
 * this codebase.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Quote.name, schema: QuoteSchema },
      { name: Invoice.name, schema: InvoiceSchema },
      { name: Media.name, schema: MediaSchema },
      { name: SupplierPurchaseOrder.name, schema: SupplierPurchaseOrderSchema },
      { name: Supplier.name, schema: SupplierSchema },
    ]),
    SettingsCoreModule,
  ],
  providers: [DocumentPdfService, MediaService, minioClientProvider, DocumentsPdfProcessor],
})
export class DocumentsWorkerModule {}
