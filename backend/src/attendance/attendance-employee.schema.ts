import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * A worker tracked for attendance/payroll — fully isolated from
 * `users/employee.schema.ts`'s `Employee` (login/POS accounts). No
 * reference, no shared collection, no shared auth path: a Pointage worker
 * authenticates only with a PIN at the public `/pointage` kiosk, never
 * against the admin/POS JWT system, and may not have a system login at
 * all. Any resemblance to a real login Employee (e.g. a cashier who is
 * also attendance-tracked) is coincidental in the data model on purpose —
 * see the "isolated employee" decision in todo-pointage.md.
 */
@Schema({ collection: 'attendance_employees', timestamps: true })
export class AttendanceEmployee {
  @Prop({ type: String, required: true, trim: true })
  firstName!: string;

  @Prop({ type: String, required: true, trim: true })
  lastName!: string;

  @Prop({ type: String, required: true, trim: true })
  phone!: string;

  @Prop({ type: String, default: null, trim: true, lowercase: true })
  email!: string | null;

  @Prop({ type: String, default: '', trim: true })
  jobTitle!: string;

  @Prop({ type: String, default: null })
  photoUrl!: string | null;

  /** argon2id hash — see attendance-pin.ts. Never returned to the frontend. */
  @Prop({ type: String, required: true })
  pinHash!: string;

  /** Integer millimes per hour (see common/money.ts's convention — 1 TND = 1000 millimes). */
  @Prop({ type: Number, required: true })
  hourlyRateMinor!: number;

  @Prop({ type: Boolean, default: true })
  active!: boolean;

  @Prop({ type: Date, default: null })
  hiredAt!: Date | null;

  @Prop({ type: String, default: '' })
  notes!: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export type AttendanceEmployeeDocument = HydratedDocument<AttendanceEmployee>;
export const AttendanceEmployeeSchema = SchemaFactory.createForClass(AttendanceEmployee);
AttendanceEmployeeSchema.index({ active: 1 });
