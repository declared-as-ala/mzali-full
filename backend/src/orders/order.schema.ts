import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ _id: false })
class OrderCustomer {
  @Prop({ type: String, required: true }) firstName!: string;
  @Prop({ type: String, default: '' }) lastName!: string;
  @Prop({ type: String, required: true }) phone!: string;
  @Prop({ type: String, default: '' }) phone2!: string;
  @Prop({ type: String, default: '' }) email!: string;
  @Prop({ type: String, required: true }) city!: string;
  @Prop({ type: String, required: true }) address!: string;
  @Prop({ type: String, default: '' }) note!: string;
}
const OrderCustomerSchema = SchemaFactory.createForClass(OrderCustomer);

@Schema({ _id: false })
class OrderItem {
  @Prop({ type: String, required: true }) productId!: string;
  @Prop({ type: String, default: null }) legacyProductId!: string | null;
  /** Backfilled by migrate:inventory-foundation (Sprint 1); consumed starting Sprint 4. */
  @Prop({ type: String, default: null }) variantId!: string | null;
  @Prop({ type: String, required: true }) name!: string;
  @Prop({ type: String, default: '' }) slug!: string;
  @Prop({ type: String, default: null }) imageUrl!: string | null;
  @Prop({ type: Number, required: true }) qty!: number;
  @Prop({ type: Number, required: true }) unitPriceMinor!: number;
  @Prop({ type: Number, required: true }) totalMinor!: number;
  @Prop({ type: Object, default: null }) variation!: Record<string, string> | null;
  @Prop({ type: String, default: null }) bundleName!: string | null;
  @Prop({ type: Number, default: null }) bundleSlot!: number | null;
  @Prop({ type: Number, default: 0 }) costMinor!: number;
}
const OrderItemSchema = SchemaFactory.createForClass(OrderItem);

@Schema({ _id: false })
class StatusHistoryEntry {
  @Prop({ type: String, default: null }) from!: string | null;
  @Prop({ type: String, required: true }) to!: string;
  @Prop({ type: Object, required: true }) by!: { type: string; id: string | null; name: string };
  @Prop({ type: Date, required: true, default: () => new Date() }) at!: Date;
  @Prop({ type: String, default: null }) note!: string | null;
}
const StatusHistoryEntrySchema = SchemaFactory.createForClass(StatusHistoryEntry);

@Schema({ _id: false })
class OrderCoupon {
  @Prop({ type: String, required: true }) couponId!: string;
  @Prop({ type: String, required: true }) code!: string;
  @Prop({ type: String, enum: ['percent', 'fixed'], required: true }) type!: 'percent' | 'fixed';
  @Prop({ type: Number, required: true }) value!: number;
  @Prop({ type: Number, required: true }) discountMinor!: number;
}
const OrderCouponSchema = SchemaFactory.createForClass(OrderCoupon);

@Schema({ _id: false })
class CarrierResult {
  @Prop({ type: String, enum: ['sent', 'failed'], required: true }) status!: 'sent' | 'failed';
  @Prop({ type: String, default: null }) response!: string | null;
  @Prop({ type: String, default: null }) tracking!: string | null;
  @Prop({ type: String, default: null }) error!: string | null;
  @Prop({ type: Date, required: true, default: () => new Date() }) pushedAt!: Date;
}
const CarrierResultSchema = SchemaFactory.createForClass(CarrierResult);

@Schema({ _id: false })
class Carrier {
  @Prop({ type: CarrierResultSchema, default: null }) navex!: CarrierResult | null;
  @Prop({ type: CarrierResultSchema, default: null }) firstdelivery!: CarrierResult | null;
  @Prop({ type: CarrierResultSchema, default: null }) axess!: CarrierResult | null;
}
const CarrierSchema = SchemaFactory.createForClass(Carrier);

@Schema({ _id: false })
class AssignmentHistoryEntry {
  @Prop({ type: String, default: null }) employeeId!: string | null;
  @Prop({ type: Date, required: true, default: () => new Date() }) at!: Date;
  @Prop({ type: String, enum: ['auto', 'admin'], required: true }) by!: 'auto' | 'admin';
}
const AssignmentHistoryEntrySchema = SchemaFactory.createForClass(AssignmentHistoryEntry);

@Schema({ _id: false })
class Assignment {
  @Prop({ type: String, default: null }) employeeId!: string | null;
  @Prop({ type: Date, default: null }) assignedAt!: Date | null;
  @Prop({ type: String, enum: ['auto', 'admin'], default: null }) assignedBy!: 'auto' | 'admin' | null;
  @Prop({ type: [AssignmentHistoryEntrySchema], default: [] }) history!: AssignmentHistoryEntry[];
}
const AssignmentSchema = SchemaFactory.createForClass(Assignment);

@Schema({ collection: 'orders', timestamps: true })
export class Order {
  @Prop({ type: Number, required: true, unique: true, index: true })
  orderNumber!: number;

  @Prop({ type: String, required: true, index: true })
  status!: string;

  @Prop({ type: [StatusHistoryEntrySchema], default: [] })
  statusHistory!: StatusHistoryEntry[];

  @Prop({ type: OrderCustomerSchema, required: true })
  customer!: OrderCustomer;

  @Prop({ type: String, default: null, index: true })
  customerId!: string | null;

  @Prop({ type: [OrderItemSchema], required: true })
  items!: OrderItem[];

  @Prop({ type: Number, required: true }) subtotalMinor!: number;
  @Prop({ type: Number, required: true, default: 0 }) shippingMinor!: number;
  @Prop({ type: Number, required: true, default: 0 }) discountMinor!: number;
  @Prop({ type: Number, required: true }) totalMinor!: number;
  @Prop({ type: Number, default: null }) manualSubtotalMinor!: number | null;
  @Prop({ type: Number, default: null }) manualTotalMinor!: number | null;
  @Prop({ type: String, default: 'TND' }) currency!: string;

  @Prop({ type: OrderCouponSchema, default: null })
  coupon!: OrderCoupon | null;

  @Prop({ type: String, default: '' })
  deliveryCompany!: string;

  @Prop({ type: CarrierSchema, default: () => ({ navex: null, firstdelivery: null, axess: null }) })
  carrier!: Carrier;

  @Prop({ type: AssignmentSchema, default: () => ({ employeeId: null, assignedAt: null, assignedBy: null, history: [] }) })
  assignment!: Assignment;

  @Prop({ type: String, default: '' }) privateNote!: string;
  @Prop({ type: Boolean, default: false }) exchange!: boolean;
  @Prop({ type: Number, default: 0 }) attempts!: number;
  @Prop({ type: String, default: '' }) source!: string;
  @Prop({ type: String, enum: ['cod', 'card'], default: 'cod' }) paymentMethod!: 'cod' | 'card';

  /** Client-generated key that makes order creation idempotent (double-tap/retry safe). */
  @Prop({ type: String, unique: true, sparse: true })
  idempotencyKey?: string;

  @Prop({ type: String, unique: true, sparse: true })
  legacyId?: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export type OrderDocument = HydratedDocument<Order>;
export const OrderSchema = SchemaFactory.createForClass(Order);

OrderSchema.index({ status: 1, createdAt: -1 });
OrderSchema.index({ 'customer.phone': 1, createdAt: -1 });
OrderSchema.index({ 'assignment.employeeId': 1, createdAt: -1 });
OrderSchema.index({ createdAt: -1 });
