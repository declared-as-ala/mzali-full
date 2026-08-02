import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type LoyaltyAccountStatus = 'ACTIVE' | 'SUSPENDED' | 'EXPIRED';

/**
 * One account per customer, opt-in only (created explicitly via the POS
 * quick-create flow or the admin/API endpoint — never auto-created on
 * first purchase, per Sprint 8 kickoff decision). A sale for a customer
 * with no loyalty account simply earns nothing.
 */
@Schema({ collection: 'loyalty_accounts', timestamps: true })
export class LoyaltyAccount {
  @Prop({ type: String, required: true, unique: true, index: true })
  customerId!: string;

  @Prop({ type: String, required: true, unique: true, index: true })
  cardNumber!: string;

  @Prop({ type: String, required: true })
  qrCodeValue!: string;

  @Prop({ type: String, required: true })
  barcodeValue!: string;

  @Prop({ type: Number, required: true, default: 0 })
  pointsBalance!: number;

  @Prop({ type: Number, required: true, default: 0 })
  lifetimePointsEarned!: number;

  @Prop({ type: Number, required: true, default: 0 })
  lifetimePointsRedeemed!: number;

  @Prop({ type: String, enum: ['ACTIVE', 'SUSPENDED', 'EXPIRED'], required: true, default: 'ACTIVE' })
  status!: LoyaltyAccountStatus;

  @Prop({ type: Date, required: true, default: () => new Date() })
  joinedAt!: Date;

  @Prop({ type: Date, default: null })
  lastActivityAt!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type LoyaltyAccountDocument = HydratedDocument<LoyaltyAccount>;
export const LoyaltyAccountSchema = SchemaFactory.createForClass(LoyaltyAccount);
