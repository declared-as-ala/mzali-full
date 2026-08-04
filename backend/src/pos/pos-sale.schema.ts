import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PosSaleStatus = 'SUSPENDED' | 'COMPLETED' | 'REFUNDED' | 'CANCELLED';
export type PosPaymentMethod = 'CASH' | 'CARD' | 'MIXED' | 'OTHER';

@Schema({ _id: false })
export class PosSaleLine {
  @Prop({ type: String, required: true }) variantId!: string;
  @Prop({ type: String, required: true }) productId!: string;
  @Prop({ type: String, required: true }) descriptionSnapshot!: string;
  @Prop({ type: String, required: true }) sku!: string;
  @Prop({ type: Object, default: {} }) variantAttributesSnapshot!: Record<string, string>;
  @Prop({ type: Number, required: true }) qty!: number;
  @Prop({ type: Number, required: true }) unitPriceMinor!: number;
  @Prop({ type: Number, default: 0 }) discountMinor!: number;
  @Prop({ type: Number, required: true }) lineTotalMinor!: number;
  /** Immutable quantity-offer pricing snapshot — see contracts/pos.ts's
   *  PosSaleLine for why this must never be recomputed from current
   *  product data after the sale is recorded. */
  @Prop({ type: String, default: null }) bundleGroupId!: string | null;
  @Prop({ type: String, default: null }) bundleId!: string | null;
  @Prop({ type: String, default: null }) bundleName!: string | null;
  @Prop({ type: Number, default: null }) regularUnitPriceMinor!: number | null;
}
const PosSaleLineSchema = SchemaFactory.createForClass(PosSaleLine);

/**
 * A POS sale. `paymentMethod`/`cashReceivedMinor`/`changeMinor` stay a
 * simple embedded summary (CASH/CARD/MIXED/OTHER) for receipt display;
 * the actual per-method breakdown lives in `pos_payments` rows (one row
 * per method, keyed by `saleId`) so revenue-by-method reports are a
 * plain $group on `method` rather than a MIXED enum bucket.
 */
@Schema({ collection: 'pos_sales', timestamps: true })
export class PosSale {
  @Prop({ type: Number, required: true, unique: true })
  saleNumber!: number;

  @Prop({ type: String, required: true })
  terminalId!: string;

  @Prop({ type: String, default: null })
  registerId!: string | null;

  @Prop({ type: String, required: true })
  cashierId!: string;

  @Prop({ type: String, required: true, index: true })
  sessionId!: string;

  @Prop({ type: String, required: true })
  locationId!: string;

  @Prop({ type: String, enum: ['SUSPENDED', 'COMPLETED', 'REFUNDED', 'CANCELLED'], required: true, default: 'SUSPENDED' })
  status!: PosSaleStatus;

  @Prop({ type: [PosSaleLineSchema], default: [] })
  lines!: PosSaleLine[];

  @Prop({ type: String, default: null })
  customerId!: string | null;

  @Prop({ type: Number, required: true, default: 0 })
  subtotalMinor!: number;

  @Prop({ type: Number, required: true, default: 0 })
  discountMinor!: number;

  @Prop({ type: Number, required: true, default: 0 })
  totalMinor!: number;

  @Prop({ type: String, enum: ['CASH', 'CARD', 'MIXED', 'OTHER'], default: null })
  paymentMethod!: PosPaymentMethod | null;

  @Prop({ type: Number, default: null })
  cashReceivedMinor!: number | null;

  @Prop({ type: Number, default: null })
  changeMinor!: number | null;

  @Prop({ type: String, default: null, unique: true, sparse: true })
  idempotencyKey!: string | null;

  @Prop({ type: Number, required: true, default: 0 })
  loyaltyPointsEarned!: number;

  @Prop({ type: Number, required: true, default: 0 })
  loyaltyPointsRedeemed!: number;

  @Prop({ type: Number, required: true, default: 0 })
  loyaltyDiscountMinor!: number;

  @Prop({ type: Date, default: null })
  completedAt!: Date | null;

  @Prop({ type: String, default: null })
  notes!: string | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type PosSaleDocument = HydratedDocument<PosSale>;
export const PosSaleSchema = SchemaFactory.createForClass(PosSale);
PosSaleSchema.index({ locationId: 1, createdAt: -1 });
PosSaleSchema.index({ cashierId: 1, createdAt: -1 });
// Every analytics aggregation's $match stage filters on status first
// (saleMatch()) — this index lets that $match use an index instead of a
// full collection scan once the sales history grows.
PosSaleSchema.index({ status: 1, createdAt: -1 });
PosSaleSchema.index({ terminalId: 1, createdAt: -1 });
