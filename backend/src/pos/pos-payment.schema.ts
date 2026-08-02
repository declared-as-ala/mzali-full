import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export const PAYMENT_METHODS = ['CASH', 'CARD', 'BANK_TRANSFER', 'MIXED_COMPONENT', 'OTHER'] as const;
export type PosPaymentRowMethod = (typeof PAYMENT_METHODS)[number];
export type PosPaymentStatus = 'PAID' | 'REFUNDED';

/**
 * One row per payment method on a sale — a mixed-method sale (cash +
 * card) creates two rows rather than one row with a "MIXED" type, so
 * every "revenue by payment method" report is a plain $group on `method`
 * (see docs/pos-platform/_master-prompt.md §38).
 */
@Schema({ collection: 'pos_payments', timestamps: { createdAt: false, updatedAt: false } })
export class PosPayment {
  @Prop({ type: String, required: true, index: true })
  saleId!: string;

  @Prop({ type: String, required: true, index: true })
  sessionId!: string;

  @Prop({ type: String, enum: PAYMENT_METHODS, required: true })
  method!: PosPaymentRowMethod;

  @Prop({ type: Number, required: true })
  amountMinor!: number;

  @Prop({ type: String, enum: ['PAID', 'REFUNDED'], required: true, default: 'PAID' })
  status!: PosPaymentStatus;

  @Prop({ type: String, required: true })
  receivedBy!: string;

  @Prop({ type: Date, required: true })
  receivedAt!: Date;
}

export type PosPaymentDocument = HydratedDocument<PosPayment>;
export const PosPaymentSchema = SchemaFactory.createForClass(PosPayment);
PosPaymentSchema.index({ sessionId: 1, method: 1 });
