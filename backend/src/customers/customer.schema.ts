import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * Guest customer record, keyed by normalized phone (`common/phone.ts`).
 * Account-readiness fields (authUserId, emailVerifiedAt) are unused today —
 * customer accounts are a deferred feature; the schema just won't need
 * migrating when they land.
 */
@Schema({ collection: 'customers', timestamps: true })
export class Customer {
  @Prop({ type: String, required: true, unique: true, index: true })
  phone!: string;

  @Prop({ type: [String], default: [] })
  altPhones!: string[];

  @Prop({ type: String, default: '' })
  firstName!: string;

  @Prop({ type: String, default: '' })
  lastName!: string;

  @Prop({ type: String, default: null, index: { sparse: true } })
  email!: string | null;

  @Prop({ type: String, default: '' })
  city!: string;

  @Prop({ type: String, default: '' })
  address!: string;

  @Prop({ type: Number, default: 0 })
  ordersCount!: number;

  @Prop({ type: Number, default: 0 })
  totalSpentMinor!: number;

  @Prop({ type: Date, default: null })
  firstOrderAt!: Date | null;

  @Prop({ type: Date, default: null })
  lastOrderAt!: Date | null;

  @Prop({ type: String, default: null })
  authUserId!: string | null;

  @Prop({ type: Date, default: null })
  emailVerifiedAt!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type CustomerDocument = HydratedDocument<Customer>;
export const CustomerSchema = SchemaFactory.createForClass(Customer);
