import { InvoiceDocument } from './invoice.schema';

const PREFIX_BY_TYPE: Record<string, string> = {
  SALES_INVOICE: 'FAC', POS_INVOICE: 'FACB', ONLINE_INVOICE: 'FACW', PROFORMA: 'PRO', CREDIT_NOTE: 'AV',
};

export function toInvoiceContract(doc: InvoiceDocument) {
  const prefix = PREFIX_BY_TYPE[doc.invoiceType] ?? 'DOC';
  return {
    id: doc.id,
    invoiceNumber: `${prefix}-${doc.createdAt.getFullYear()}-${String(doc.invoiceNumber).padStart(6, '0')}`,
    invoiceType: doc.invoiceType,
    customerSnapshot: doc.customerSnapshot,
    companySnapshot: doc.companySnapshot,
    billingAddress: doc.billingAddress,
    issueDate: doc.issueDate.toISOString(),
    dueDate: doc.dueDate ? doc.dueDate.toISOString() : null,
    saleId: doc.saleId,
    orderId: doc.orderId,
    quoteId: doc.quoteId,
    creditedInvoiceId: doc.creditedInvoiceId,
    lines: doc.lines,
    subtotalMinor: doc.subtotalMinor,
    discountMinor: doc.discountMinor,
    taxMinor: doc.taxMinor,
    timbreFiscalMinor: doc.timbreFiscalMinor,
    shippingMinor: doc.shippingMinor,
    totalMinor: doc.totalMinor,
    paidMinor: doc.paidMinor,
    balanceMinor: doc.balanceMinor,
    payments: doc.payments,
    currency: doc.currency,
    paymentStatus: doc.paymentStatus,
    status: doc.status,
    notes: doc.notes,
    terms: doc.terms,
    pdfMediaId: doc.pdfMediaId,
    createdAt: doc.createdAt.toISOString(),
    finalizedAt: doc.finalizedAt ? doc.finalizedAt.toISOString() : null,
  };
}
