import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type { CouponType } from '@contracts';

@Schema({ _id: false })
class AppliesTo {
  @Prop({ type: String, enum: ['all', 'categories', 'products'], default: 'all' })
  kind!: 'all' | 'categories' | 'products';

  @Prop({ type: [String], default: [] })
  ids!: string[];
}
const AppliesToSchema = SchemaFactory.createForClass(AppliesTo);

@Schema({ collection: 'coupons', timestamps: true })
export class Coupon {
  @Prop({ type: String, required: true, unique: true, uppercase: true, trim: true })
  code!: string;

  @Prop({ type: String, enum: ['percent', 'fixed'], required: true })
  type!: CouponType;

  /** percent: integer 1–100. fixed: minor units (millimes). */
  @Prop({ type: Number, required: true })
  value!: number;

  @Prop({ type: Number, default: null })
  minSubtotalMinor!: number | null;

  @Prop({ type: Date, default: null })
  startsAt!: Date | null;

  @Prop({ type: Date, default: null })
  endsAt!: Date | null;

  @Prop({ type: Number, default: null })
  usageLimit!: number | null;

  @Prop({ type: Number, default: 0 })
  usageCount!: number;

  @Prop({ type: Number, default: null })
  perPhoneLimit!: number | null;

  @Prop({ type: Boolean, default: true })
  active!: boolean;

  @Prop({ type: AppliesToSchema, default: () => ({ kind: 'all', ids: [] }) })
  appliesTo!: AppliesTo;

  createdAt!: Date;
  updatedAt!: Date;
}

export type CouponDocument = HydratedDocument<Coupon>;
export const CouponSchema = SchemaFactory.createForClass(Coupon);

@Schema({ collection: 'coupon_redemptions', timestamps: { createdAt: true, updatedAt: false } })
export class CouponRedemption {
  @Prop({ type: String, required: true, index: true })
  couponId!: string;

  @Prop({ type: String, required: true, index: true })
  orderId!: string;

  @Prop({ type: String, required: true, index: true })
  phone!: string;

  @Prop({ type: Number, required: true })
  amountMinor!: number;

  createdAt!: Date;
}

export type CouponRedemptionDocument = HydratedDocument<CouponRedemption>;
export const CouponRedemptionSchema = SchemaFactory.createForClass(CouponRedemption);
