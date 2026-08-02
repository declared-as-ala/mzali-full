import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type LoyaltyTransactionType =
  | 'EARN'
  | 'REDEEM'
  | 'REFUND_REVERSAL'
  | 'MANUAL_ADJUSTMENT'
  | 'BONUS'
  | 'EXPIRATION'
  | 'MIGRATION';

export type LoyaltyTransactionSourceType = 'POS_SALE' | 'ONLINE_ORDER' | 'REFUND' | 'MANUAL' | 'CAMPAIGN';

/**
 * Immutable ledger — the only record of how `loyalty_accounts.pointsBalance`
 * reached its current value. Every row is written by
 * `LoyaltyLedgerService.apply()`, never inserted directly elsewhere.
 */
@Schema({ collection: 'loyalty_transactions', timestamps: false })
export class LoyaltyTransaction {
  @Prop({ type: String, required: true, index: true })
  customerId!: string;

  @Prop({ type: String, required: true, index: true })
  loyaltyAccountId!: string;

  @Prop({
    type: String,
    enum: ['EARN', 'REDEEM', 'REFUND_REVERSAL', 'MANUAL_ADJUSTMENT', 'BONUS', 'EXPIRATION', 'MIGRATION'],
    required: true,
  })
  type!: LoyaltyTransactionType;

  @Prop({ type: Number, required: true })
  pointsDelta!: number;

  @Prop({ type: Number, required: true })
  balanceBefore!: number;

  @Prop({ type: Number, required: true })
  balanceAfter!: number;

  @Prop({ type: String, enum: ['POS_SALE', 'ONLINE_ORDER', 'REFUND', 'MANUAL', 'CAMPAIGN'], required: true })
  sourceType!: LoyaltyTransactionSourceType;

  @Prop({ type: String, default: null, index: true })
  sourceId!: string | null;

  /** Required (enforced in the service layer) for MANUAL_ADJUSTMENT. */
  @Prop({ type: String, default: null })
  reason!: string | null;

  /** Employee id; null for system-generated EARN/REFUND_REVERSAL rows. */
  @Prop({ type: String, default: null })
  performedBy!: string | null;

  @Prop({ type: Date, required: true, default: () => new Date() })
  createdAt!: Date;
}

export type LoyaltyTransactionDocument = HydratedDocument<LoyaltyTransaction>;
export const LoyaltyTransactionSchema = SchemaFactory.createForClass(LoyaltyTransaction);
LoyaltyTransactionSchema.index({ loyaltyAccountId: 1, createdAt: -1 });
