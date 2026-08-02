import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export const GOODS_RECEIPT_STATUSES = ['DRAFT', 'POSTED'] as const;
export type GoodsReceiptStatus = (typeof GOODS_RECEIPT_STATUSES)[number];

@Schema({ _id: false })
class GoodsReceiptActor {
  @Prop({ type: String, enum: ['system', 'employee', 'migration', 'service'], required: true })
  type!: 'system' | 'employee' | 'migration' | 'service';
  @Prop({ type: String, default: null }) id!: string | null;
  @Prop({ type: String, required: true }) name!: string;
}
const GoodsReceiptActorSchema = SchemaFactory.createForClass(GoodsReceiptActor);

@Schema({ _id: false })
export class GoodsReceiptLine {
  @Prop({ type: String, required: true }) variantId!: string;
  @Prop({ type: Number, required: true }) orderedQuantity!: number;
  @Prop({ type: Number, required: true }) previouslyReceived!: number;
  @Prop({ type: Number, required: true }) receivedNow!: number;
  @Prop({ type: Number, required: true, default: 0 }) damagedQuantity!: number;
  @Prop({ type: Number, required: true, default: 0 }) rejectedQuantity!: number;
  /** receivedNow - damagedQuantity - rejectedQuantity — the only portion that ever hits stock_items. */
  @Prop({ type: Number, required: true }) acceptedQuantity!: number;
  @Prop({ type: String, default: null }) batchReference!: string | null;
  @Prop({ type: Number, required: true }) unitCostMinor!: number;
}
const GoodsReceiptLineSchema = SchemaFactory.createForClass(GoodsReceiptLine);

/**
 * Created in POSTED status by GoodsReceiptsService.post() — this sprint's
 * create-and-post-in-one-call flow (see supplier-management.md's API
 * surface note: "draft state is optional UX, not required").
 */
@Schema({ collection: 'goods_receipts', timestamps: true })
export class GoodsReceipt {
  @Prop({ type: Number, required: true, unique: true })
  goodsReceiptNumber!: number;

  @Prop({ type: String, required: true, index: true })
  purchaseOrderId!: string;

  @Prop({ type: String, required: true })
  supplierId!: string;

  @Prop({ type: String, required: true, uppercase: true })
  locationId!: string;

  @Prop({ type: Date, required: true })
  receivedDate!: Date;

  @Prop({ type: GoodsReceiptActorSchema, required: true })
  receivedBy!: GoodsReceiptActor;

  @Prop({ type: [GoodsReceiptLineSchema], default: [] })
  lines!: GoodsReceiptLine[];

  @Prop({ type: [String], default: [] })
  attachments!: string[];

  @Prop({ type: String, default: null })
  notes!: string | null;

  @Prop({ type: String, enum: GOODS_RECEIPT_STATUSES, required: true, default: 'POSTED' })
  status!: GoodsReceiptStatus;

  /** Client-generated key that makes receipt posting idempotent (retry-safe
   *  after a flaky connection) — same pattern as PosSale/Order. */
  @Prop({ type: String, unique: true, sparse: true })
  idempotencyKey?: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export type GoodsReceiptDocument = HydratedDocument<GoodsReceipt>;
export const GoodsReceiptSchema = SchemaFactory.createForClass(GoodsReceipt);
GoodsReceiptSchema.index({ purchaseOrderId: 1, createdAt: -1 });
