import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PosCashMovementType = 'ADD' | 'REMOVE' | 'OPENING_FUND' | 'CASH_SALE' | 'CASH_REFUND' | 'CASH_IN' | 'CASH_OUT' | 'CORRECTION' | 'CLOSING';

/** Cash added to or removed from the drawer outside of a sale (float
 *  top-up, till-to-safe drop) — tracked separately from sales so the
 *  session close's expected-cash formula is auditable line by line. */
@Schema({ collection: 'pos_cash_movements', timestamps: { createdAt: true, updatedAt: false } })
export class PosCashMovement {
  @Prop({ type: String, required: true, index: true })
  sessionId!: string;

  @Prop({ type: String, enum: ['ADD', 'REMOVE', 'OPENING_FUND', 'CASH_SALE', 'CASH_REFUND', 'CASH_IN', 'CASH_OUT', 'CORRECTION', 'CLOSING'], required: true })
  type!: PosCashMovementType;

  @Prop({ type: String }) terminalId?: string;
  @Prop({ type: String }) cashierId?: string;
  @Prop({ type: String, default: null }) saleId!: string | null;
  @Prop({ type: String }) operationKey?: string;

  @Prop({ type: Number, required: true })
  amountMinor!: number;

  @Prop({ type: String, required: true })
  reason!: string;

  @Prop({ type: String, required: true })
  performedBy!: string;

  createdAt!: Date;
}

export type PosCashMovementDocument = HydratedDocument<PosCashMovement>;
export const PosCashMovementSchema = SchemaFactory.createForClass(PosCashMovement);
PosCashMovementSchema.index({ operationKey: 1 }, { unique: true, partialFilterExpression: { operationKey: { $type: 'string' } } });
