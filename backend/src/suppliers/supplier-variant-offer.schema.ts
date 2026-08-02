import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/** One row per (supplier, variant) — a variant can have offers from
 *  multiple suppliers; `preferred` marks the default used for
 *  low-stock-driven PO suggestions (Sprint 6's suggestions endpoint). */
@Schema({ collection: 'supplier_variant_offers', timestamps: true })
export class SupplierVariantOffer {
  @Prop({ type: String, required: true, index: true })
  supplierId!: string;

  @Prop({ type: String, required: true, index: true })
  variantId!: string;

  @Prop({ type: String, default: null })
  supplierSku!: string | null;

  @Prop({ type: Number, required: true })
  purchasePriceMinor!: number;

  @Prop({ type: Number, required: true, default: 1 })
  minimumOrderQuantity!: number;

  @Prop({ type: Number, required: true, default: 1 })
  packSize!: number;

  @Prop({ type: Number, default: null })
  leadTimeDays!: number | null;

  @Prop({ type: Boolean, required: true, default: false })
  preferred!: boolean;

  @Prop({ type: Date, default: null })
  lastPurchaseDate!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type SupplierVariantOfferDocument = HydratedDocument<SupplierVariantOffer>;
export const SupplierVariantOfferSchema = SchemaFactory.createForClass(SupplierVariantOffer);
SupplierVariantOfferSchema.index({ supplierId: 1, variantId: 1 }, { unique: true });
