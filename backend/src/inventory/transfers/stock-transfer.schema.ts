import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export const TRANSFER_STATUSES = [
  'DRAFT', 'REQUESTED', 'APPROVED', 'PREPARING', 'SHIPPED',
  'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED', 'REJECTED',
] as const;
export type TransferStatus = (typeof TRANSFER_STATUSES)[number];

@Schema({ _id: false })
class TransferActor {
  @Prop({ type: String, enum: ['system', 'employee', 'migration', 'service'], required: true })
  type!: 'system' | 'employee' | 'migration' | 'service';
  @Prop({ type: String, default: null }) id!: string | null;
  @Prop({ type: String, required: true }) name!: string;
}
const TransferActorSchema = SchemaFactory.createForClass(TransferActor);

@Schema({ _id: false })
export class TransferLine {
  @Prop({ type: String, required: true }) variantId!: string;
  @Prop({ type: String, required: true }) productId!: string;
  @Prop({ type: String, required: true }) productName!: string;
  @Prop({ type: Number, required: true }) requestedQuantity!: number;
  @Prop({ type: Number, default: null }) approvedQuantity!: number | null;
  @Prop({ type: Number, default: null }) shippedQuantity!: number | null;
  @Prop({ type: Number, required: true, default: 0 }) receivedQuantity!: number;
  @Prop({ type: Number, required: true, default: 0 }) damagedQuantity!: number;
  @Prop({ type: Number, required: true, default: 0 }) missingQuantity!: number;
}
const TransferLineSchema = SchemaFactory.createForClass(TransferLine);

@Schema({ _id: false })
class TransferStatusHistoryEntry {
  @Prop({ type: String, default: null }) from!: string | null;
  @Prop({ type: String, required: true }) to!: string;
  @Prop({ type: TransferActorSchema, required: true }) by!: TransferActor;
  @Prop({ type: Date, required: true }) at!: Date;
  @Prop({ type: String, default: null }) note!: string | null;
}
const TransferStatusHistoryEntrySchema = SchemaFactory.createForClass(TransferStatusHistoryEntry);

/**
 * Source stock decreases on ship, destination stock increases on receive —
 * never before (master-prompt §17's explicit "do not increase boutique
 * stock before receipt confirmation"). Damaged/missing quantities are
 * tracked as line-level informational counters, not separate stock
 * movements — they represent units that were shipped but never actually
 * entered destination sellable stock, so there's no stock change to
 * record for them beyond the transfer_out that already happened at ship.
 */
@Schema({ collection: 'stock_transfers', timestamps: true })
export class StockTransfer {
  @Prop({ type: Number, required: true, unique: true })
  transferNumber!: number;

  @Prop({ type: String, required: true, uppercase: true })
  sourceLocationId!: string;

  @Prop({ type: String, required: true, uppercase: true })
  destinationLocationId!: string;

  @Prop({ type: String, enum: TRANSFER_STATUSES, required: true, default: 'DRAFT', index: true })
  status!: TransferStatus;

  @Prop({ type: [TransferLineSchema], default: [] })
  lines!: TransferLine[];

  @Prop({ type: [TransferStatusHistoryEntrySchema], default: [] })
  statusHistory!: TransferStatusHistoryEntry[];

  @Prop({ type: TransferActorSchema, required: true })
  requestedBy!: TransferActor;

  @Prop({ type: TransferActorSchema, default: null })
  approvedBy!: TransferActor | null;

  @Prop({ type: String, default: null })
  note!: string | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type StockTransferDocument = HydratedDocument<StockTransfer>;
export const StockTransferSchema = SchemaFactory.createForClass(StockTransfer);
StockTransferSchema.index({ sourceLocationId: 1, status: 1 });
StockTransferSchema.index({ destinationLocationId: 1, status: 1 });
