import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type { EmployeeRole } from '@contracts';

export const EMPLOYEE_ROLES: EmployeeRole[] = [
  'super_admin',
  'admin',
  'order_manager',
  'catalog_manager',
  'viewer',
  'employee',
  'cashier',
  'store_manager',
];

@Schema({ _id: false })
export class PasswordHash {
  /** argon2id for all new hashes; scrypt-legacy only for migrated accounts. */
  @Prop({ type: String, enum: ['argon2id', 'scrypt-legacy'], required: true })
  algo!: 'argon2id' | 'scrypt-legacy';

  @Prop({ type: String, required: true })
  hash!: string;

  /** Only present for scrypt-legacy (hex salt from the old JSON store). */
  @Prop({ type: String })
  salt?: string;
}
const PasswordHashSchema = SchemaFactory.createForClass(PasswordHash);

@Schema({ collection: 'employees', timestamps: true })
export class Employee {
  @Prop({ type: String, required: true, unique: true, lowercase: true, trim: true })
  email!: string;

  @Prop({ type: String, required: true, trim: true })
  name!: string;

  @Prop({ type: String, enum: EMPLOYEE_ROLES, required: true, default: 'employee' })
  role!: EmployeeRole;

  @Prop({ type: PasswordHashSchema, required: true })
  passwordHash!: PasswordHash;

  @Prop({ type: Boolean, default: true })
  active!: boolean;

  @Prop({ type: Boolean, default: false })
  mustChangePassword!: boolean;

  /** UUID from data/employees.json, or 'admin' for the migrated admin account. */
  @Prop({ type: String, unique: true, sparse: true })
  legacyId?: string;

  @Prop({ type: Date, default: null })
  lastLoginAt!: Date | null;

  @Prop({ type: Number, default: 0 })
  failedLoginAttempts!: number;

  @Prop({ type: Date, default: null })
  lockedUntil!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type EmployeeDocument = HydratedDocument<Employee>;
export const EmployeeSchema = SchemaFactory.createForClass(Employee);
