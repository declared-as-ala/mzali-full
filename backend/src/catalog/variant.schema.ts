import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * One row per product today (Sprint 1 — see docs/pos-platform/PLAN.md
 * decision D7: the live catalog's `options[]` are customer-facing
 * preference fields, not a real per-combination stock matrix, so
 * generation is 1:1 with the product rather than a cartesian product of
 * options). `attributes` stays empty until a specific product genuinely
 * needs per-size/color stock tracking, at which point additional variants
 * can be created for that product without any schema change here.
 */
@Schema({ collection: 'variants', timestamps: true })
export class Variant {
  @Prop({ type: String, required: true, index: true })
  productId!: string;

  @Prop({ type: String, required: true, unique: true })
  sku!: string;

  /** Uniqueness enforced via a partial index below, not `sparse` — a sparse
   *  index only excludes documents where the field is absent, but every
   *  variant here explicitly stores `barcode: null` until one is assigned,
   *  which a sparse+unique index would still collide on. */
  @Prop({ type: String, default: null })
  barcode!: string | null;

  @Prop({ type: Object, default: {} })
  attributes!: Record<string, string>;

  @Prop({ type: Boolean, default: true })
  active!: boolean;

  @Prop({ type: Number, default: null })
  sellingPriceMinor!: number | null;

  @Prop({ type: Number, default: null })
  compareAtPriceMinor!: number | null;

  @Prop({ type: Number, default: null })
  lastPurchaseCostMinor!: number | null;

  @Prop({ type: Number, default: null })
  averageCostMinor!: number | null;

  /** Manually entered by the admin on the product form — the single source
   *  of truth for margin reporting going forward (see stats.service.ts's
   *  marginReport). Distinct from `averageCostMinor`/`lastPurchaseCostMinor`
   *  above, which were computed from the now-retired goods-receipt workflow
   *  and are kept only for historical reads. */
  @Prop({ type: Number, default: null })
  purchasePriceMinor!: number | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type VariantDocument = HydratedDocument<Variant>;
export const VariantSchema = SchemaFactory.createForClass(Variant);
VariantSchema.index({ barcode: 1 }, { unique: true, partialFilterExpression: { barcode: { $type: 'string' } } });
