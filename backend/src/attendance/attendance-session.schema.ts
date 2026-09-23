import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AttendanceSessionStatus = 'OPEN' | 'CLOSED' | 'NEEDS_REVIEW';

/** Preserves the original clockIn/clockOut before an admin correction —
 *  corrections never silently overwrite history, see #19. */
@Schema({ _id: false })
class AttendanceCorrection {
  @Prop({ type: Date, default: null }) originalClockIn!: Date | null;
  @Prop({ type: Date, default: null }) originalClockOut!: Date | null;
  @Prop({ type: String, required: true }) reason!: string;
  @Prop({ type: String, required: true }) correctedBy!: string;
  @Prop({ type: String, default: null }) correctedByName!: string | null;
  @Prop({ type: Date, required: true, default: () => new Date() }) correctedAt!: Date;
}
const AttendanceCorrectionSchema = SchemaFactory.createForClass(AttendanceCorrection);

/**
 * One clock-in/clock-out pair. A single calendar day legitimately has
 * multiple sessions (e.g. a lunch break clock-out/clock-in) — daily/
 * weekly/monthly totals are always a SUM of completed sessions, never a
 * single "hours today" field on the employee (see #4/#12: timestamps are
 * the source of truth, not a manually entered duration).
 */
@Schema({ collection: 'attendance_sessions', timestamps: true })
export class AttendanceSession {
  @Prop({ type: String, required: true, index: true })
  employeeId!: string;

  @Prop({ type: Date, required: true })
  clockIn!: Date;

  @Prop({ type: Date, default: null })
  clockOut!: Date | null;

  /** Cached at clock-out for cheap reporting — timestamps remain the
   *  source of truth; this is always re-derivable from clockIn/clockOut. */
  @Prop({ type: Number, default: null })
  durationMinutes!: number | null;

  /**
   * OPEN: currently clocked in.
   * CLOSED: normal completed session.
   * NEEDS_REVIEW: an open session whose business date is no longer today
   *   (employee forgot to clock out) — see #20. The kiosk refuses to let
   *   the employee touch it; only an admin correction can resolve it.
   */
  @Prop({ type: String, enum: ['OPEN', 'CLOSED', 'NEEDS_REVIEW'], required: true, default: 'OPEN', index: true })
  status!: AttendanceSessionStatus;

  /** Africa/Tunis business date of clockIn — see attendance-date.ts. */
  @Prop({ type: String, required: true, index: true })
  businessDate!: string;

  /** Optional device/kiosk identifier, free text — not a hard requirement. */
  @Prop({ type: String, default: null })
  source!: string | null;

  /** Set once this session is included in a PayrollPayment — from that
   *  point on it's excluded from "unpaid hours" forever. Never cleared. */
  @Prop({ type: String, default: null, index: true })
  payrollPaymentId!: string | null;

  @Prop({ type: AttendanceCorrectionSchema, default: null })
  correction!: AttendanceCorrection | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type AttendanceSessionDocument = HydratedDocument<AttendanceSession>;
export const AttendanceSessionSchema = SchemaFactory.createForClass(AttendanceSession);

// The hard guarantee behind "only one open session per employee" — mirrors
// PosCashierSessionSchema's `one_open_session_per_terminal` pattern
// exactly (backend/src/pos/pos-cashier-session.schema.ts). A
// transaction-wrapped check in AttendanceService gives a clean error
// message first; this index is what makes it actually safe under a race.
AttendanceSessionSchema.index(
  { employeeId: 1 },
  { unique: true, partialFilterExpression: { status: 'OPEN' }, name: 'one_open_session_per_employee' },
);
AttendanceSessionSchema.index({ employeeId: 1, businessDate: 1 });
AttendanceSessionSchema.index({ businessDate: 1, status: 1 });
AttendanceSessionSchema.index({ employeeId: 1, payrollPaymentId: 1 });
