import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PosSessionStatus = 'OPEN' | 'CLOSED';

/** Immutable snapshot of an X/Z report, stored once generated so a later
 *  fetch is exact even if something else (e.g. a future refund) would
 *  change the underlying aggregation — see docs/pos-platform/PLAN.md /
 *  SPRINT-03 "Z report is immutable after generation". */
@Schema({ _id: false })
class SessionReportSnapshot {
  @Prop({ type: String, enum: ['X', 'Z'], required: true }) type!: 'X' | 'Z';
  @Prop({ type: Date, required: true }) generatedAt!: Date;
  @Prop({ type: Number, required: true }) expectedCashMinor!: number;
  @Prop({ type: Number, default: null }) countedCashMinor!: number | null;
  @Prop({ type: Number, default: null }) cashDifferenceMinor!: number | null;
  @Prop({ type: Number, required: true }) grossSalesMinor!: number;
  @Prop({ type: Number, required: true }) refundsMinor!: number;
  @Prop({ type: Number, required: true }) discountsMinor!: number;
  @Prop({ type: Number, required: true }) netSalesMinor!: number;
  @Prop({ type: Number, required: true }) cashSalesMinor!: number;
  @Prop({ type: Number, required: true }) cardSalesMinor!: number;
  @Prop({ type: Number, required: true }) otherSalesMinor!: number;
  @Prop({ type: Number, required: true }) cashMovementsAddMinor!: number;
  @Prop({ type: Number, required: true }) cashMovementsRemoveMinor!: number;
  @Prop({ type: Number, required: true }) transactionCount!: number;
}
const SessionReportSnapshotSchema = SchemaFactory.createForClass(SessionReportSnapshot);

@Schema({ collection: 'pos_cashier_sessions', timestamps: true })
export class PosCashierSession {
  @Prop({ type: String, required: true, index: true })
  cashierId!: string;

  @Prop({ type: String, required: true, index: true })
  terminalId!: string;

  @Prop({ type: String, default: null })
  registerId!: string | null;

  @Prop({ type: Number, required: true, default: 0 })
  openingCashMinor!: number;

  @Prop({ type: Date, required: true })
  openedAt!: Date;

  @Prop({ type: Date, default: null })
  closedAt!: Date | null;

  @Prop({ type: Number, default: null })
  closingCountedCashMinor!: number | null;

  @Prop({ type: String, enum: ['OPEN', 'CLOSED'], required: true, default: 'OPEN', index: true })
  status!: PosSessionStatus;

  // Running totals, updated atomically alongside each sale/movement.
  @Prop({ type: Number, required: true, default: 0 }) grossSalesMinor!: number;
  @Prop({ type: Number, required: true, default: 0 }) refundsMinor!: number;
  @Prop({ type: Number, required: true, default: 0 }) discountsMinor!: number;
  @Prop({ type: Number, required: true, default: 0 }) cashSalesMinor!: number;
  @Prop({ type: Number, required: true, default: 0 }) cardSalesMinor!: number;
  @Prop({ type: Number, required: true, default: 0 }) otherSalesMinor!: number;
  @Prop({ type: Number, required: true, default: 0 }) cashMovementsAddMinor!: number;
  @Prop({ type: Number, required: true, default: 0 }) cashMovementsRemoveMinor!: number;
  @Prop({ type: Number, required: true, default: 0 }) transactionCount!: number;

  @Prop({ type: [SessionReportSnapshotSchema], default: [] })
  reports!: SessionReportSnapshot[];

  /** Manager sign-off on a closed session — see /admin/pos-analytics
   *  "closed session not reviewed" alert. Never auto-set. */
  @Prop({ type: Date, default: null })
  reviewedAt!: Date | null;

  @Prop({ type: String, default: null })
  reviewedBy!: string | null;

  @Prop({ type: String, default: null })
  reviewNote!: string | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type PosCashierSessionDocument = HydratedDocument<PosCashierSession>;
export const PosCashierSessionSchema = SchemaFactory.createForClass(PosCashierSession);
PosCashierSessionSchema.index({ terminalId: 1, status: 1 });
