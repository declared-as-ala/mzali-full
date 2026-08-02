import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ _id: false })
class PriceHistoryEntry {
  @Prop({ type: Number, required: true }) priceMinor!: number;
  @Prop({ type: Date, required: true }) at!: Date;
}
const PriceHistoryEntrySchema = SchemaFactory.createForClass(PriceHistoryEntry);

/**
 * A supplier's own product list — purely a reference catalog for building
 * printable purchase orders. NOT inventory: nothing here ever touches stock
 * or the store's own product/variant catalog (see docs on the lightweight
 * supplier module — no goods-receipt workflow, no automatic stock effect).
 */
@Schema({ collection: 'supplier_products', timestamps: true })
export class SupplierProduct {
  @Prop({ type: String, required: true, index: true })
  supplierId!: string;

  @Prop({ type: String, required: true })
  name!: string;

  @Prop({ type: String, default: null })
  category!: string | null;

  @Prop({ type: String, default: null })
  brand!: string | null;

  @Prop({ type: String, default: null })
  size!: string | null;

  @Prop({ type: String, default: null })
  color!: string | null;

  @Prop({ type: Number, required: true })
  purchasePriceMinor!: number;

  @Prop({ type: Number, default: null })
  suggestedSellingPriceMinor!: number | null;

  @Prop({ type: String, default: null })
  notes!: string | null;

  @Prop({ type: Boolean, required: true, default: true })
  active!: boolean;

  /** Append-only — a new entry is pushed whenever purchasePriceMinor changes. */
  @Prop({ type: [PriceHistoryEntrySchema], default: [] })
  priceHistory!: PriceHistoryEntry[];

  createdAt!: Date;
  updatedAt!: Date;
}

export type SupplierProductDocument = HydratedDocument<SupplierProduct>;
export const SupplierProductSchema = SchemaFactory.createForClass(SupplierProduct);
SupplierProductSchema.index({ supplierId: 1, active: 1 });
SupplierProductSchema.index({ name: 'text', category: 'text', brand: 'text' });
