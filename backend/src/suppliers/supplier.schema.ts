import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export const SUPPLIER_STATUSES = ['ACTIVE', 'INACTIVE', 'BLOCKED'] as const;
export type SupplierStatus = (typeof SUPPLIER_STATUSES)[number];

@Schema({ _id: false })
class Address {
  @Prop({ type: String, default: null }) line1!: string | null;
  @Prop({ type: String, default: null }) line2!: string | null;
  @Prop({ type: String, default: null }) city!: string | null;
  @Prop({ type: String, default: null }) governorate!: string | null;
  @Prop({ type: String, default: null }) postalCode!: string | null;
  @Prop({ type: String, default: 'TN' }) country!: string;
}
const AddressSchema = SchemaFactory.createForClass(Address);

@Schema({ collection: 'suppliers', timestamps: true })
export class Supplier {
  @Prop({ type: String, required: true, unique: true })
  code!: string;

  @Prop({ type: String, required: true })
  companyName!: string;

  @Prop({ type: String, default: null })
  contactName!: string | null;

  @Prop({ type: String, default: null })
  email!: string | null;

  @Prop({ type: String, default: null })
  phone!: string | null;

  @Prop({ type: String, default: null })
  secondaryPhone!: string | null;

  @Prop({ type: String, default: null })
  whatsapp!: string | null;

  @Prop({ type: String, default: null })
  taxIdentifier!: string | null;

  @Prop({ type: String, default: null })
  registrationNumber!: string | null;

  @Prop({ type: AddressSchema, default: null })
  billingAddress!: Address | null;

  @Prop({ type: AddressSchema, default: null })
  warehouseAddress!: Address | null;

  @Prop({ type: Number, default: null })
  paymentTermsDays!: number | null;

  @Prop({ type: String, default: null })
  preferredPaymentMethod!: string | null;

  @Prop({ type: String, required: true, default: 'TND' })
  currency!: 'TND';

  @Prop({ type: Number, default: null })
  leadTimeDays!: number | null;

  @Prop({ type: Number, default: null })
  minimumOrderMinor!: number | null;

  @Prop({ type: String, enum: SUPPLIER_STATUSES, required: true, default: 'ACTIVE' })
  status!: SupplierStatus;

  @Prop({ type: String, default: null })
  notes!: string | null;

  @Prop({ type: [String], default: [] })
  documentMediaIds!: string[];

  createdAt!: Date;
  updatedAt!: Date;
}

export type SupplierDocument = HydratedDocument<Supplier>;
export const SupplierSchema = SchemaFactory.createForClass(Supplier);
