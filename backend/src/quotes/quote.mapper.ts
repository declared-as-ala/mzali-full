import { QuoteDocument } from './quote.schema';

export function toQuoteContract(doc: QuoteDocument) {
  return {
    id: doc.id,
    quoteNumber: `DEV-${doc.createdAt.getFullYear()}-${String(doc.quoteNumber).padStart(6, '0')}`,
    customerId: doc.customerId,
    customerSnapshot: doc.customerSnapshot,
    billingAddress: doc.billingAddress,
    shippingAddress: doc.shippingAddress,
    issueDate: doc.issueDate.toISOString(),
    expiryDate: doc.expiryDate ? doc.expiryDate.toISOString() : null,
    salespersonId: doc.salespersonId,
    lines: doc.lines,
    subtotalMinor: doc.subtotalMinor,
    discountMinor: doc.discountMinor,
    taxMinor: doc.taxMinor,
    shippingMinor: doc.shippingMinor,
    totalMinor: doc.totalMinor,
    notes: doc.notes,
    terms: doc.terms,
    status: doc.status,
    version: doc.version,
    previousVersionId: doc.previousVersionId,
    convertedOrderId: doc.convertedOrderId,
    convertedInvoiceId: doc.convertedInvoiceId,
    pdfMediaId: doc.pdfMediaId,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
