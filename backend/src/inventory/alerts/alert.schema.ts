import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export const ALERT_TYPES = ['low_stock', 'out_of_stock'] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

/**
 * One active row per (variantId, locationId) — upserted by the scheduled
 * `check-low-stock` job (CleanupProcessor), never written by any other
 * code path. `resolvedAt` is set (not deleted) when stock recovers, so
 * there's a history of what was low and when, not just current state.
 */
@Schema({ collection: 'alerts', timestamps: true })
export class Alert {
  @Prop({ type: String, enum: ALERT_TYPES, required: true })
  type!: AlertType;

  @Prop({ type: String, required: true, index: true })
  variantId!: string;

  @Prop({ type: String, required: true, uppercase: true })
  locationId!: string;

  @Prop({ type: String, required: true })
  productId!: string;

  @Prop({ type: String, required: true })
  productName!: string;

  @Prop({ type: Number, required: true })
  available!: number;

  @Prop({ type: Number, required: true })
  threshold!: number;

  @Prop({ type: Boolean, required: true, default: false })
  negativeStock!: boolean;

  @Prop({ type: Date, default: null, index: true })
  resolvedAt!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type AlertDocument = HydratedDocument<Alert>;
export const AlertSchema = SchemaFactory.createForClass(Alert);
AlertSchema.index({ variantId: 1, locationId: 1 }, { unique: true });
