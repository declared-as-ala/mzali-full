import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PaymentMethod = 'cash' | 'transfer' | 'other';

/**
 * An immutable record of one payroll payment. Once created, a payment's
 * financial fields are never recalculated with today's rate — the rate
 * used at payment time is snapshotted here forever (see #17). Paying
 * never deletes or resets the `AttendanceSession`s it covers — it only
 * stamps them with this payment's id (see AttendanceSession.payrollPaymentId),
 * so "unpaid hours" going forward is always just "sessions with no
 * payment id", and full history survives indefinitely (see #16).
 */
@Schema({ collection: 'payroll_payments', timestamps: true })
export class PayrollPayment {
  @Prop({ type: String, required: true, unique: true })
  payrollNumber!: string; // "PAY-00001" — see CountersService, same mechanism as orderNumber.

  @Prop({ type: String, required: true, index: true })
  employeeId!: string;

  /** The exact AttendanceSession ids this payment covers — never mutated
   *  after creation. */
  @Prop({ type: [String], required: true })
  sessionIds!: string[];

  @Prop({ type: Date, required: true })
  periodStart!: Date;

  @Prop({ type: Date, required: true })
  periodEnd!: Date;

  @Prop({ type: Number, required: true })
  totalMinutes!: number;

  /** The employee's hourlyRateMinor AT PAYMENT TIME — never re-derived
   *  from the employee's current rate on a later read. */
  @Prop({ type: Number, required: true })
  hourlyRateMinorSnapshot!: number;

  @Prop({ type: Number, required: true })
  baseAmountMinor!: number;

  @Prop({ type: Number, required: true, default: 0 })
  bonusMinor!: number;

  @Prop({ type: Number, required: true, default: 0 })
  deductionMinor!: number;

  @Prop({ type: Number, required: true })
  finalAmountMinor!: number;

  @Prop({ type: String, enum: ['cash', 'transfer', 'other'], required: true })
  paymentMethod!: PaymentMethod;

  @Prop({ type: Date, required: true, default: () => new Date() })
  paidAt!: Date;

  @Prop({ type: String, required: true })
  paidById!: string;

  @Prop({ type: String, required: true })
  paidByName!: string;

  @Prop({ type: String, default: '' })
  note!: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export type PayrollPaymentDocument = HydratedDocument<PayrollPayment>;
export const PayrollPaymentSchema = SchemaFactory.createForClass(PayrollPayment);
PayrollPaymentSchema.index({ employeeId: 1, paidAt: -1 });
PayrollPaymentSchema.index({ paidAt: -1 });
