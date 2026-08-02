import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * One row per "cashier tapped a product that had zero Boutique stock" —
 * purely a signal for the "Ventes perdues" estimate panel, never affects
 * stock/reservations/sales. Deliberately minimal: no dedupe/rate-limiting,
 * a cashier tapping the same sold-out item 3 times is 3 real signals that
 * a customer wanted it.
 */
@Schema({ collection: 'pos_lost_sales', timestamps: { createdAt: true, updatedAt: false } })
export class PosLostSale {
  @Prop({ type: String, required: true, index: true })
  variantId!: string;

  @Prop({ type: String, required: true, index: true })
  productId!: string;

  @Prop({ type: String, required: true })
  productName!: string;

  @Prop({ type: String, required: true })
  locationId!: string;

  @Prop({ type: String, default: null })
  terminalId!: string | null;

  @Prop({ type: String, required: true })
  cashierId!: string;

  /** Snapshot at the moment of the attempt — used for the missed-revenue
   *  estimate without needing to re-resolve the price later. */
  @Prop({ type: Number, required: true })
  priceMinorAtAttempt!: number;

  createdAt!: Date;
}

export type PosLostSaleDocument = HydratedDocument<PosLostSale>;
export const PosLostSaleSchema = SchemaFactory.createForClass(PosLostSale);
PosLostSaleSchema.index({ variantId: 1, createdAt: -1 });
PosLostSaleSchema.index({ createdAt: -1 });
