import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Job } from 'bullmq';
import { Model } from 'mongoose';
import { QUEUES } from '@/jobs/queues';
import { MediaService } from '@/media/media.service';
import { SettingsService } from '@/settings/settings.service';
import { Invoice } from '@/invoices/invoice.schema';
import { Quote } from '@/quotes/quote.schema';
import { Supplier } from '@/suppliers/supplier.schema';
import { SupplierPurchaseOrder } from '@/suppliers/supplier-purchase-order.schema';
import { DocumentPdfService } from './document-pdf.service';

export type DocumentsPdfJob =
  | { documentType: 'quote'; documentId: string }
  | { documentType: 'invoice'; documentId: string }
  | { documentType: 'supplier-purchase-order'; documentId: string };

const PREFIX_BY_INVOICE_TYPE: Record<string, string> = {
  SALES_INVOICE: 'FAC', POS_INVOICE: 'FACB', ONLINE_INVOICE: 'FACW', PROFORMA: 'PRO', CREDIT_NOTE: 'AV',
};
const TITLE_BY_INVOICE_TYPE: Record<string, string> = {
  SALES_INVOICE: 'FACTURE', POS_INVOICE: 'FACTURE', ONLINE_INVOICE: 'FACTURE',
  PROFORMA: 'FACTURE PROFORMA', CREDIT_NOTE: 'AVOIR',
};

/**
 * Worker-only. Generates a quote/invoice PDF and uploads it to MinIO —
 * never runs inline in a request handler (see invoicing-and-quotes.md
 * "PDF generation"). Shares the existing (previously unused)
 * media-processing queue rather than adding a 5th one.
 */
@Processor(QUEUES.MEDIA_PROCESSING)
export class DocumentsPdfProcessor extends WorkerHost {
  private readonly logger = new Logger(DocumentsPdfProcessor.name);

  constructor(
    @InjectModel(Quote.name) private readonly quotes: Model<Quote>,
    @InjectModel(Invoice.name) private readonly invoices: Model<Invoice>,
    @InjectModel(SupplierPurchaseOrder.name) private readonly supplierPurchaseOrders: Model<SupplierPurchaseOrder>,
    @InjectModel(Supplier.name) private readonly suppliers: Model<Supplier>,
    private readonly pdf: DocumentPdfService,
    private readonly media: MediaService,
    private readonly settings: SettingsService,
  ) {
    super();
  }

  async process(job: Job<DocumentsPdfJob>): Promise<void> {
    if (job.data.documentType === 'quote') await this.processQuote(job.data.documentId);
    else if (job.data.documentType === 'invoice') await this.processInvoice(job.data.documentId);
    else if (job.data.documentType === 'supplier-purchase-order') await this.processSupplierPurchaseOrder(job.data.documentId);
  }

  private async processQuote(id: string): Promise<void> {
    const doc = await this.quotes.findById(id).catch(() => null);
    if (!doc) { this.logger.warn(`Quote ${id} not found for PDF generation`); return; }
    const company = await this.settings.getCompany();

    const buffer = await this.pdf.render({
      title: 'DEVIS',
      number: `DEV-${doc.createdAt.getFullYear()}-${String(doc.quoteNumber).padStart(6, '0')}`,
      issueDate: doc.issueDate,
      dueOrExpiryDate: doc.expiryDate,
      dueOrExpiryLabel: 'Validité',
      company: { legalName: company.legalName, address: company.address, matriculeFiscal: company.matriculeFiscal, rcNumber: company.rcNumber, phone: company.phone, email: company.email },
      customer: doc.customerSnapshot,
      lines: doc.lines,
      subtotalMinor: doc.subtotalMinor,
      discountMinor: doc.discountMinor,
      taxMinor: doc.taxMinor,
      shippingMinor: doc.shippingMinor,
      totalMinor: doc.totalMinor,
      notes: doc.notes,
      terms: doc.terms,
    });

    try {
      const result = await this.media.uploadDocument(buffer, { mime: 'application/pdf', filename: `devis-${doc.quoteNumber}.pdf`, bucket: 'documents' });
      await this.quotes.updateOne({ _id: doc.id }, { $set: { pdfMediaId: result.id } });
      this.logger.log(`Generated quote PDF -> media ${result.id}`);
    } catch (err) {
      this.logger.error(`Quote PDF generation failed for ${doc.id}: ${String(err)}`);
    }
  }

  private async processInvoice(id: string): Promise<void> {
    const doc = await this.invoices.findById(id).catch(() => null);
    if (!doc) { this.logger.warn(`Invoice ${id} not found for PDF generation`); return; }

    const buffer = await this.pdf.render({
      title: TITLE_BY_INVOICE_TYPE[doc.invoiceType] ?? 'FACTURE',
      number: `${PREFIX_BY_INVOICE_TYPE[doc.invoiceType] ?? 'DOC'}-${doc.createdAt.getFullYear()}-${String(doc.invoiceNumber).padStart(6, '0')}`,
      issueDate: doc.issueDate,
      dueOrExpiryDate: doc.dueDate,
      dueOrExpiryLabel: 'Échéance',
      company: doc.companySnapshot,
      customer: doc.customerSnapshot,
      lines: doc.lines,
      subtotalMinor: doc.subtotalMinor,
      discountMinor: doc.discountMinor,
      taxMinor: doc.taxMinor,
      timbreFiscalMinor: doc.timbreFiscalMinor,
      shippingMinor: doc.shippingMinor,
      totalMinor: doc.totalMinor,
      notes: doc.notes,
      terms: doc.terms,
    });

    try {
      const result = await this.media.uploadDocument(buffer, { mime: 'application/pdf', filename: `facture-${doc.invoiceNumber}.pdf`, bucket: 'documents' });
      await this.invoices.updateOne({ _id: doc.id }, { $set: { pdfMediaId: result.id } });
      this.logger.log(`Generated invoice PDF -> media ${result.id}`);
    } catch (err) {
      this.logger.error(`Invoice PDF generation failed for ${doc.id}: ${String(err)}`);
    }
  }

  private async processSupplierPurchaseOrder(id: string): Promise<void> {
    const doc = await this.supplierPurchaseOrders.findById(id).catch(() => null);
    if (!doc) { this.logger.warn(`SupplierPurchaseOrder ${id} not found for PDF generation`); return; }
    const [company, supplier] = await Promise.all([
      this.settings.getCompany(),
      this.suppliers.findById(doc.supplierId).catch(() => null),
    ]);

    const supplierAddress = supplier?.billingAddress
      ? [supplier.billingAddress.line1, supplier.billingAddress.city].filter(Boolean).join(', ') || null
      : null;

    const buffer = await this.pdf.render({
      title: 'BON DE COMMANDE',
      number: `PO-${doc.createdAt.getFullYear()}-${String(doc.poNumber).padStart(6, '0')}`,
      issueDate: doc.orderDate,
      dueOrExpiryDate: null,
      dueOrExpiryLabel: 'Livraison prévue',
      company: { legalName: company.legalName, address: company.address, matriculeFiscal: company.matriculeFiscal, rcNumber: company.rcNumber, phone: company.phone, email: company.email },
      customer: {
        name: supplier?.companyName ?? 'Fournisseur',
        phone: supplier?.phone ?? '',
        email: supplier?.email ?? null,
        address: supplierAddress,
      },
      lines: doc.lines.map((l) => ({
        variantId: null,
        productId: null,
        descriptionSnapshot: [l.name, l.brand, l.size, l.color].filter(Boolean).join(' — '),
        quantity: l.quantity,
        unitPriceMinor: l.unitPriceMinor,
        discountMinor: 0,
        taxMinor: 0,
        lineTotalMinor: l.lineTotalMinor,
      })),
      subtotalMinor: doc.totalMinor,
      discountMinor: 0,
      taxMinor: 0,
      shippingMinor: 0,
      totalMinor: doc.totalMinor,
      notes: doc.notes,
      terms: null,
    });

    try {
      const result = await this.media.uploadDocument(buffer, { mime: 'application/pdf', filename: `bon-commande-${doc.poNumber}.pdf`, bucket: 'documents' });
      await this.supplierPurchaseOrders.updateOne({ _id: doc.id }, { $set: { pdfMediaId: result.id } });
      this.logger.log(`Generated supplier PO PDF -> media ${result.id}`);
    } catch (err) {
      this.logger.error(`Supplier PO PDF generation failed for ${doc.id}: ${String(err)}`);
    }
  }
}
