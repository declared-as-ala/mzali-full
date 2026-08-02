import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { CardTemplateCode } from './loyalty-card-batch.schema';

export const LOYALTY_CARD_STATUSES = ['UNASSIGNED', 'ACTIVE', 'SUSPENDED', 'LOST', 'REPLACED', 'REVOKED'] as const;
export type LoyaltyCardStatus = (typeof LOYALTY_CARD_STATUSES)[number];

export type LoyaltyCardHistoryEvent =
  | 'GENERATED' | 'ASSIGNED' | 'SUSPENDED' | 'REACTIVATED' | 'MARKED_LOST' | 'REPLACED' | 'REVOKED';

@Schema({ _id: false })
class CardActor {
  @Prop({ type: String, enum: ['employee', 'system'], required: true }) type!: 'employee' | 'system';
  @Prop({ type: String, default: null }) id!: string | null;
  @Prop({ type: String, required: true }) name!: string;
}
const CardActorSchema = SchemaFactory.createForClass(CardActor);

@Schema({ _id: false })
class CardHistoryEntry {
  @Prop({
    type: String,
    enum: ['GENERATED', 'ASSIGNED', 'SUSPENDED', 'REACTIVATED', 'MARKED_LOST', 'REPLACED', 'REVOKED'],
    required: true,
  })
  event!: LoyaltyCardHistoryEvent;

  @Prop({ type: Date, required: true, default: () => new Date() })
  at!: Date;

  @Prop({ type: CardActorSchema, required: true })
  by!: CardActor;

  @Prop({ type: String, default: null })
  note!: string | null;
}
const CardHistoryEntrySchema = SchemaFactory.createForClass(CardHistoryEntry);

/**
 * The physical (or virtual) card token — separate from `LoyaltyAccount`,
 * which represents the customer's points relationship. A card can exist
 * UNASSIGNED (printed, sitting in a drawer) before ever touching an
 * account. See docs/pos-platform/loyalty-cards.md for the full lifecycle.
 */
@Schema({ collection: 'loyalty_cards', timestamps: true })
export class LoyaltyCard {
  @Prop({ type: String, required: true, unique: true, index: true })
  cardNumber!: string;

  /** Opaque, cryptographically random — never derivable from cardNumber
   *  or any customer PII. This is what's actually encoded in the QR. */
  @Prop({ type: String, required: true, unique: true, index: true })
  qrToken!: string;

  /** Code128-safe value for the printed barcode — the card number itself
   *  (already alphanumeric-safe, no separate secret needed). */
  @Prop({ type: String, required: true })
  barcodeValue!: string;

  @Prop({ type: String, default: null, index: true })
  batchId!: string | null;

  @Prop({ type: String, enum: ['STANDARD', 'SILVER', 'GOLD', 'VIP'], required: true })
  templateCode!: CardTemplateCode;

  @Prop({ type: String, enum: LOYALTY_CARD_STATUSES, required: true, default: 'UNASSIGNED', index: true })
  status!: LoyaltyCardStatus;

  @Prop({ type: String, default: null, index: true })
  accountId!: string | null;

  @Prop({ type: String, default: null, index: true })
  customerId!: string | null;

  @Prop({ type: Date, default: null })
  assignedAt!: Date | null;

  @Prop({ type: CardActorSchema, default: null })
  assignedBy!: CardActor | null;

  /** If this card replaced a lost/damaged one. */
  @Prop({ type: String, default: null })
  replacesCardId!: string | null;

  /** If this card was itself replaced — the new card's id. */
  @Prop({ type: String, default: null })
  replacedByCardId!: string | null;

  @Prop({ type: Date, default: null })
  revokedAt!: Date | null;

  @Prop({ type: String, default: null })
  revokedReason!: string | null;

  @Prop({ type: [CardHistoryEntrySchema], default: [] })
  history!: CardHistoryEntry[];

  createdAt!: Date;
  updatedAt!: Date;
}

export type LoyaltyCardDocument = HydratedDocument<LoyaltyCard>;
export const LoyaltyCardSchema = SchemaFactory.createForClass(LoyaltyCard);
LoyaltyCardSchema.index({ batchId: 1, status: 1 });
