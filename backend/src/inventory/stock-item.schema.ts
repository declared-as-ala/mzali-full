import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * Per-variant, per-location current stock state. Replaces the single-
 * warehouse `inventory_items` collection (see docs/pos-platform/PLAN.md
 * decision D3). `quantityAvailable` is deliberately NOT stored — every
 * read computes `quantityOnHand - quantityReserved` so there's only ever
 * one source of truth to keep consistent (see stock-business-rules.md).
 */
@Schema({ collection: 'stock_items', timestamps: { createdAt: false, updatedAt: true } })
export class StockItem {
  @Prop({ type: String, required: true, index: true })
  variantId!: string;

  /** Location `code` (e.g. 'DEPOT', 'BOUTIQUE'), not the Location's ObjectId. */
  @Prop({ type: String, required: true, uppercase: true })
  locationId!: string;

  @Prop({ type: Number, required: true, default: 0 })
  quantityOnHand!: number;

  @Prop({ type: Number, required: true, default: 0 })
  quantityReserved!: number;

  @Prop({ type: Number, default: 0 })
  reorderPoint!: number;

  @Prop({ type: Number, default: null })
  targetStockLevel!: number | null;

  @Prop({ type: Number, default: null })
  lowStockThreshold!: number | null;

  @Prop({ type: Number, default: null })
  averageCostMinor!: number | null;

  @Prop({ type: Number, default: null })
  lastPurchaseCostMinor!: number | null;

  updatedAt!: Date;
}

export type StockItemDocument = HydratedDocument<StockItem> & { quantityAvailable: number };
export const StockItemSchema = SchemaFactory.createForClass(StockItem);
StockItemSchema.index({ variantId: 1, locationId: 1 }, { unique: true });

StockItemSchema.virtual('quantityAvailable').get(function (this: StockItem) {
  return this.quantityOnHand - this.quantityReserved;
});
StockItemSchema.set('toJSON', { virtuals: true });
StockItemSchema.set('toObject', { virtuals: true });
