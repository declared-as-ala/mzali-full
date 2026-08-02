import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export const CARD_TEMPLATE_CODES = ['STANDARD', 'SILVER', 'GOLD', 'VIP'] as const;
export type CardTemplateCode = (typeof CARD_TEMPLATE_CODES)[number];

export const CARD_BATCH_STATUSES = ['GENERATED', 'EXPORTED', 'PRINTED'] as const;
export type CardBatchStatus = (typeof CARD_BATCH_STATUSES)[number];

@Schema({ _id: false })
class BatchActor {
  @Prop({ type: String, enum: ['employee', 'system'], required: true }) type!: 'employee' | 'system';
  @Prop({ type: String, default: null }) id!: string | null;
  @Prop({ type: String, required: true }) name!: string;
}
const BatchActorSchema = SchemaFactory.createForClass(BatchActor);

/**
 * A print run of physical (or virtual, for the pre-Sprint-8 quick-create
 * path) loyalty cards. Never deleted — a batch is the paper trail for
 * "which cards did we hand to the printer". Assigned/unassigned/revoked
 * counts are deliberately NOT stored here (computed live from
 * `loyalty_cards` on read) to avoid a denormalized-counter drift bug —
 * same reasoning as `StockItem.quantityAvailable` being a virtual.
 */
@Schema({ collection: 'loyalty_card_batches', timestamps: true })
export class LoyaltyCardBatch {
  @Prop({ type: Number, required: true, unique: true })
  batchNumber!: number;

  @Prop({ type: String, required: true })
  name!: string;

  @Prop({ type: Number, required: true })
  quantity!: number;

  @Prop({ type: String, enum: CARD_TEMPLATE_CODES, required: true })
  templateCode!: CardTemplateCode;

  @Prop({ type: Number, required: true, default: 1 })
  templateVersion!: number;

  @Prop({ type: BatchActorSchema, required: true })
  generatedBy!: BatchActor;

  @Prop({ type: Date, required: true, default: () => new Date() })
  generatedAt!: Date;

  @Prop({ type: Date, default: null })
  exportedAt!: Date | null;

  @Prop({ type: Date, default: null })
  printedAt!: Date | null;

  @Prop({ type: String, enum: CARD_BATCH_STATUSES, required: true, default: 'GENERATED' })
  status!: CardBatchStatus;

  @Prop({ type: String, default: null })
  notes!: string | null;

  /** True for the invisible batch backing pre-Sprint-8-style quick-create
   *  cards (never printed, never exported) — kept queryable through the
   *  same model without cluttering the real print-batch list. */
  @Prop({ type: Boolean, required: true, default: false })
  virtual!: boolean;

  /** Client-generated key — retrying a batch-generation request must never
   *  create a second hidden batch. */
  @Prop({ type: String, unique: true, sparse: true })
  idempotencyKey?: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export type LoyaltyCardBatchDocument = HydratedDocument<LoyaltyCardBatch>;
export const LoyaltyCardBatchSchema = SchemaFactory.createForClass(LoyaltyCardBatch);
