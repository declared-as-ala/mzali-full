import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type { StockMovementType } from '@contracts';

export const STOCK_MOVEMENT_TYPES: StockMovementType[] = [
  // existing — unchanged, still used by the online-order reserve/commit/release flow
  'migration_init',
  'manual_adjust',
  'order_reserve',
  'order_release',
  'order_commit',
  'correction',
  // new — POS/transfer/purchase/loyalty-adjacent (see docs/pos-platform/inventory-architecture.md)
  'pos_sale',
  'purchase_receipt',
  'return_restock',
  'refund_restock',
  'exchange_out',
  'exchange_in',
  'transfer_out',
  'transfer_in',
  'damage',
  'loss',
  'stocktake_correction',
  'supplier_return',
];

@Schema({ _id: false })
class MovementActor {
  @Prop({ type: String, enum: ['system', 'employee', 'migration'], required: true })
  type!: 'system' | 'employee' | 'migration';

  @Prop({ type: String, default: null })
  id!: string | null;

  @Prop({ type: String, required: true })
  name!: string;
}
const MovementActorSchema = SchemaFactory.createForClass(MovementActor);

/** Append-only stock ledger — no update/delete API exists for this collection. */
@Schema({ collection: 'stock_movements', timestamps: { createdAt: true, updatedAt: false } })
export class StockMovement {
  @Prop({ type: String, required: true, index: true })
  variantId!: string;

  /** Location `code` (e.g. 'DEPOT', 'BOUTIQUE'), matching StockItem.locationId. */
  @Prop({ type: String, required: true, uppercase: true })
  locationId!: string;

  @Prop({ type: String, enum: STOCK_MOVEMENT_TYPES, required: true })
  type!: StockMovementType;

  /** Signed delta. For reserve/release this applies to `reserved`; for
   *  commit/manual_adjust/migration_init/correction/pos_sale/etc it applies to `onHand`. */
  @Prop({ type: Number, required: true })
  qty!: number;

  @Prop({ type: Number, required: true })
  onHandAfter!: number;

  @Prop({ type: Number, required: true })
  reservedAfter!: number;

  @Prop({ type: String, default: null, index: true })
  orderId!: string | null;

  @Prop({ type: String, default: null })
  reference!: string | null;

  @Prop({ type: String, default: null })
  reason!: string | null;

  @Prop({ type: MovementActorSchema, required: true })
  actor!: MovementActor;

  createdAt!: Date;
}

export type StockMovementDocument = HydratedDocument<StockMovement>;
export const StockMovementSchema = SchemaFactory.createForClass(StockMovement);
