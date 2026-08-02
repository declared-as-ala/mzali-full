import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export const INVOICE_TYPES = ['SALES_INVOICE', 'POS_INVOICE', 'ONLINE_INVOICE', 'PROFORMA', 'CREDIT_NOTE'] as const;
export type InvoiceType = (typeof INVOICE_TYPES)[number];

export const INVOICE_STATUSES = [
  'DRAFT', 'FINALIZED', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED', 'CREDITED',
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const PAYMENT_STATUSES = ['UNPAID', 'PARTIALLY_PAID', 'PAID'] as const;
export type InvoicePaymentStatus = (typeof PAYMENT_STATUSES)[number];

@Schema({ _id: false })
class InvoiceAddress {
  @Prop({ type: String, default: null }) line1!: string | null;
  @Prop({ type: String, default: null }) line2!: string | null;
  @Prop({ type: String, default: null }) city!: string | null;
  @Prop({ type: String, default: null }) governorate!: string | null;
  @Prop({ type: String, default: null }) postalCode!: string | null;
  @Prop({ type: String, default: 'TN' }) country!: string;
}
const InvoiceAddressSchema = SchemaFactory.createForClass(InvoiceAddress);

@Schema({ _id: false })
class InvoiceCustomerSnapshot {
  @Prop({ type: String, required: true }) name!: string;
  @Prop({ type: String, required: true }) phone!: string;
  @Prop({ type: String, default: null }) email!: string | null;
  @Prop({ type: String, default: null }) address!: string | null;
}
const InvoiceCustomerSnapshotSchema = SchemaFactory.createForClass(InvoiceCustomerSnapshot);

/** Boutique's own legal info, frozen at issue time — settings.company can
 *  change later without altering an already-issued invoice's snapshot. */
@Schema({ _id: false })
class InvoiceCompanySnapshot {
  @Prop({ type: String, default: '' }) legalName!: string;
  @Prop({ type: String, default: '' }) address!: string;
  @Prop({ type: String, default: '' }) matriculeFiscal!: string;
  @Prop({ type: String, default: '' }) rcNumber!: string;
  @Prop({ type: String, default: '' }) phone!: string;
  @Prop({ type: String, default: '' }) email!: string;
}
const InvoiceCompanySnapshotSchema = SchemaFactory.createForClass(InvoiceCompanySnapshot);

@Schema({ _id: false })
export class InvoiceLine {
  @Prop({ type: String, default: null }) variantId!: string | null;
  @Prop({ type: String, default: null }) productId!: string | null;
  @Prop({ type: String, required: true }) descriptionSnapshot!: string;
  @Prop({ type: Number, required: true }) quantity!: number;
  @Prop({ type: Number, required: true }) unitPriceMinor!: number;
  @Prop({ type: Number, required: true, default: 0 }) discountMinor!: number;
  @Prop({ type: Number, required: true, default: 0 }) taxMinor!: number;
  @Prop({ type: Number, required: true }) lineTotalMinor!: number;
}
const InvoiceLineSchema = SchemaFactory.createForClass(InvoiceLine);

@Schema({ _id: false })
class InvoicePayment {
  @Prop({ type: Number, required: true }) amountMinor!: number;
  @Prop({ type: String, required: true }) method!: string;
  @Prop({ type: Date, required: true }) receivedAt!: Date;
  @Prop({ type: String, required: true }) receivedBy!: string;
}
const InvoicePaymentSchema = SchemaFactory.createForClass(InvoicePayment);

/**
 * Once `status` moves to FINALIZED, InvoicesService.update() refuses any
 * change to lines/totals/snapshots — only `notes` and payment recording
 * (via the dedicated recordPayment(), never a generic patch) remain
 * writable. See invoicing-and-quotes.md "The immutability rule".
 */
@Schema({ collection: 'invoices', timestamps: true })
export class Invoice {
  @Prop({ type: Number, required: true, index: true })
  invoiceNumber!: number;

  @Prop({ type: String, enum: INVOICE_TYPES, required: true, index: true })
  invoiceType!: InvoiceType;

  @Prop({ type: InvoiceCustomerSnapshotSchema, required: true })
  customerSnapshot!: InvoiceCustomerSnapshot;

  @Prop({ type: InvoiceCompanySnapshotSchema, required: true })
  companySnapshot!: InvoiceCompanySnapshot;

  @Prop({ type: InvoiceAddressSchema, default: null })
  billingAddress!: InvoiceAddress | null;

  @Prop({ type: Date, required: true })
  issueDate!: Date;

  @Prop({ type: Date, default: null })
  dueDate!: Date | null;

  @Prop({ type: String, default: null })
  saleId!: string | null;

  @Prop({ type: String, default: null })
  orderId!: string | null;

  @Prop({ type: String, default: null })
  quoteId!: string | null;

  /** Set only on CREDIT_NOTE documents — the invoice this credit corrects. */
  @Prop({ type: String, default: null, index: true })
  creditedInvoiceId!: string | null;

  @Prop({ type: [InvoiceLineSchema], default: [] })
  lines!: InvoiceLine[];

  @Prop({ type: Number, required: true, default: 0 })
  subtotalMinor!: number;

  @Prop({ type: Number, required: true, default: 0 })
  discountMinor!: number;

  @Prop({ type: Number, required: true, default: 0 })
  taxMinor!: number;

  @Prop({ type: Number, required: true, default: 0 })
  timbreFiscalMinor!: number;

  @Prop({ type: Number, required: true, default: 0 })
  shippingMinor!: number;

  @Prop({ type: Number, required: true, default: 0 })
  totalMinor!: number;

  @Prop({ type: Number, required: true, default: 0 })
  paidMinor!: number;

  @Prop({ type: Number, required: true, default: 0 })
  balanceMinor!: number;

  @Prop({ type: [InvoicePaymentSchema], default: [] })
  payments!: InvoicePayment[];

  @Prop({ type: String, required: true, default: 'TND' })
  currency!: 'TND';

  @Prop({ type: String, enum: PAYMENT_STATUSES, required: true, default: 'UNPAID' })
  paymentStatus!: InvoicePaymentStatus;

  @Prop({ type: String, enum: INVOICE_STATUSES, required: true, default: 'DRAFT', index: true })
  status!: InvoiceStatus;

  @Prop({ type: String, default: null })
  notes!: string | null;

  @Prop({ type: String, default: null })
  terms!: string | null;

  @Prop({ type: String, default: null })
  pdfMediaId!: string | null;

  @Prop({ type: String, required: true })
  createdBy!: string;

  @Prop({ type: Date, default: null })
  finalizedAt!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type InvoiceDocument = HydratedDocument<Invoice>;
export const InvoiceSchema = SchemaFactory.createForClass(Invoice);
InvoiceSchema.index({ invoiceType: 1, invoiceNumber: 1 }, { unique: true });
