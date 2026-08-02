import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export const STOCKTAKE_STATUSES = [
  'DRAFT', 'IN_PROGRESS', 'COUNTED', 'REVIEW_REQUIRED', 'APPROVED', 'POSTED', 'CANCELLED',
] as const;
export type StocktakeStatus = (typeof STOCKTAKE_STATUSES)[number];

@Schema({ _id: false })
class StocktakeActor {
  @Prop({ type: String, enum: ['system', 'employee', 'migration', 'service'], required: true })
  type!: 'system' | 'employee' | 'migration' | 'service';
  @Prop({ type: String, default: null }) id!: string | null;
  @Prop({ type: String, required: true }) name!: string;
}
const StocktakeActorSchema = SchemaFactory.createForClass(StocktakeActor);

@Schema({ _id: false })
export class StocktakeLine {
  @Prop({ type: String, required: true }) variantId!: string;
  @Prop({ type: String, required: true }) productId!: string;
  @Prop({ type: String, required: true }) productName!: string;
  /** Snapshotted from stock_items.quantityOnHand at creation time — never re-read live afterward. */
  @Prop({ type: Number, required: true }) expectedQuantity!: number;
  @Prop({ type: Number, default: null }) countedQuantity!: number | null;
  @Prop({ type: Number, default: null }) difference!: number | null;
  @Prop({ type: String, default: null }) reasonIfLarge!: string | null;
}
const StocktakeLineSchema = SchemaFactory.createForClass(StocktakeLine);

@Schema({ _id: false })
class StocktakeScope {
  @Prop({ type: String, enum: ['all', 'categories'], required: true }) kind!: 'all' | 'categories';
  @Prop({ type: [String], default: [] }) categoryIds!: string[];
}
const StocktakeScopeSchema = SchemaFactory.createForClass(StocktakeScope);

/**
 * Never replaces quantityOnHand directly — posting always goes through
 * StockLedgerService.applyMovement() with a computed delta, same as every
 * other stock mutation. See stock-business-rules.md.
 */
@Schema({ collection: 'stocktakes', timestamps: true })
export class Stocktake {
  @Prop({ type: Number, required: true, unique: true })
  stocktakeNumber!: number;

  @Prop({ type: String, required: true, uppercase: true, index: true })
  locationId!: string;

  @Prop({ type: String, enum: STOCKTAKE_STATUSES, required: true, default: 'DRAFT', index: true })
  status!: StocktakeStatus;

  @Prop({ type: StocktakeScopeSchema, required: true })
  scope!: StocktakeScope;

  @Prop({ type: Boolean, required: true, default: false })
  blindCount!: boolean;

  @Prop({ type: [StocktakeLineSchema], default: [] })
  lines!: StocktakeLine[];

  @Prop({ type: StocktakeActorSchema, required: true })
  startedBy!: StocktakeActor;

  @Prop({ type: StocktakeActorSchema, default: null })
  approvedBy!: StocktakeActor | null;

  @Prop({ type: Date, default: null })
  postedAt!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type StocktakeDocument = HydratedDocument<Stocktake>;
export const StocktakeSchema = SchemaFactory.createForClass(Stocktake);
