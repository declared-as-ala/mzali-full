import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export const QUOTE_STATUSES = [
  'DRAFT', 'SENT', 'VIEWED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CONVERTED', 'CANCELLED',
] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

@Schema({ _id: false })
class QuoteAddress {
  @Prop({ type: String, default: null }) line1!: string | null;
  @Prop({ type: String, default: null }) line2!: string | null;
  @Prop({ type: String, default: null }) city!: string | null;
  @Prop({ type: String, default: null }) governorate!: string | null;
  @Prop({ type: String, default: null }) postalCode!: string | null;
  @Prop({ type: String, default: 'TN' }) country!: string;
}
const QuoteAddressSchema = SchemaFactory.createForClass(QuoteAddress);

@Schema({ _id: false })
class QuoteCustomerSnapshot {
  @Prop({ type: String, required: true }) name!: string;
  @Prop({ type: String, required: true }) phone!: string;
  @Prop({ type: String, default: null }) email!: string | null;
  @Prop({ type: String, default: null }) address!: string | null;
}
const QuoteCustomerSnapshotSchema = SchemaFactory.createForClass(QuoteCustomerSnapshot);

@Schema({ _id: false })
export class QuoteLine {
  @Prop({ type: String, default: null }) variantId!: string | null;
  @Prop({ type: String, default: null }) productId!: string | null;
  @Prop({ type: String, required: true }) descriptionSnapshot!: string;
  @Prop({ type: Number, required: true }) quantity!: number;
  @Prop({ type: Number, required: true }) unitPriceMinor!: number;
  @Prop({ type: Number, required: true, default: 0 }) discountMinor!: number;
  @Prop({ type: Number, required: true, default: 0 }) taxMinor!: number;
  @Prop({ type: Number, required: true }) lineTotalMinor!: number;
}
const QuoteLineSchema = SchemaFactory.createForClass(QuoteLine);

/**
 * Once a quote leaves DRAFT, no field on this document is ever mutated
 * again except status/version-history-adjacent bookkeeping — any content
 * edit creates a brand new document (same quoteNumber, version+1,
 * previousVersionId set). See QuotesService.revise().
 */
@Schema({ collection: 'quotes', timestamps: true })
export class Quote {
  @Prop({ type: Number, required: true, index: true })
  quoteNumber!: number;

  @Prop({ type: String, default: null })
  customerId!: string | null;

  @Prop({ type: QuoteCustomerSnapshotSchema, required: true })
  customerSnapshot!: QuoteCustomerSnapshot;

  @Prop({ type: QuoteAddressSchema, default: null })
  billingAddress!: QuoteAddress | null;

  @Prop({ type: QuoteAddressSchema, default: null })
  shippingAddress!: QuoteAddress | null;

  @Prop({ type: Date, required: true })
  issueDate!: Date;

  @Prop({ type: Date, default: null })
  expiryDate!: Date | null;

  @Prop({ type: String, required: true })
  salespersonId!: string;

  @Prop({ type: [QuoteLineSchema], default: [] })
  lines!: QuoteLine[];

  @Prop({ type: Number, required: true, default: 0 })
  subtotalMinor!: number;

  @Prop({ type: Number, required: true, default: 0 })
  discountMinor!: number;

  @Prop({ type: Number, required: true, default: 0 })
  taxMinor!: number;

  @Prop({ type: Number, required: true, default: 0 })
  shippingMinor!: number;

  @Prop({ type: Number, required: true, default: 0 })
  totalMinor!: number;

  @Prop({ type: String, default: null })
  notes!: string | null;

  @Prop({ type: String, default: null })
  terms!: string | null;

  @Prop({ type: String, enum: QUOTE_STATUSES, required: true, default: 'DRAFT', index: true })
  status!: QuoteStatus;

  @Prop({ type: Number, required: true, default: 1 })
  version!: number;

  @Prop({ type: String, default: null })
  previousVersionId!: string | null;

  @Prop({ type: String, default: null })
  convertedOrderId!: string | null;

  @Prop({ type: String, default: null })
  convertedInvoiceId!: string | null;

  @Prop({ type: String, default: null })
  pdfMediaId!: string | null;

  @Prop({ type: String, required: true })
  createdBy!: string;

  @Prop({ type: String, required: true })
  updatedBy!: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export type QuoteDocument = HydratedDocument<Quote>;
export const QuoteSchema = SchemaFactory.createForClass(Quote);
QuoteSchema.index({ quoteNumber: 1, version: -1 });
