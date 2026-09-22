import { randomUUID } from 'node:crypto';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { computeVariationKey } from './order-variation-key';

@Schema({ _id: false })
class OrderCustomer {
  @Prop({ type: String, default: '' }) firstName!: string;
  @Prop({ type: String, default: '' }) lastName!: string;
  @Prop({ type: String, required: true }) phone!: string;
  @Prop({ type: String, default: '' }) phone2!: string;
  @Prop({ type: String, default: '' }) email!: string;
  @Prop({ type: String, default: '' }) city!: string;
  /**
   * Délégation ("Mo3tamadia" / معتمدية) within `city` (the governorate) —
   * an explicit, admin-set signal, distinct from the free-text `address`.
   * Feeding this into First Delivery's locality resolution as the exact
   * delegation lets it match immediately instead of guessing from address
   * free text, which is what previously caused the wrong delegation
   * (e.g. "Akouda") to be silently inserted for orders that only ever had
   * a governorate on them — see first-delivery.service.ts's
   * resolveLocalityDetailed. Options are scoped per governorate from
   * First Delivery's own locality directory (ShippingService
   * .firstDeliveryDelegations), never a separate hardcoded list that
   * could drift out of sync with what First Delivery actually recognizes.
   */
  @Prop({ type: String, default: '' }) locality!: string;
  @Prop({ type: String, default: '' }) address!: string;
  @Prop({ type: String, default: '' }) note!: string;
}
const OrderCustomerSchema = SchemaFactory.createForClass(OrderCustomer);

@Schema({ _id: false })
class OrderItem {
  /**
   * Stable per-item identity, unique within the order — lets the Order
   * Drawer (and any future line-level edit/removal) target an exact line
   * instead of relying on array position, which breaks under bundle
   * grouping/reordering/concurrent edits. Generated once at item-creation
   * time (`randomUUID()`), never regenerated or reused across edits — an
   * item removed and a materially different item added later must never
   * collide on identity. Existing orders predating this field get it via
   * `migrate:order-variation-keys` (same pass that backfills
   * `variationKey`), not retroactively by Mongoose (schema defaults only
   * apply to newly-constructed subdocuments, not documents hydrated from
   * already-stored data).
   */
  @Prop({ type: String, required: true, default: () => randomUUID() }) itemId!: string;
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
  /**
   * Denormalized, normalized "size|color" key derived from `variation`
   * (see order-variation-key.ts) — kept in sync automatically by the
   * pre-save hook below, never set directly by callers. Lets the
   * product+variant order filter match legacy items (no `variantId`) by
   * an indexed equality check instead of re-normalizing free text per
   * query. Null when `variation` isn't an unambiguous single size+color
   * pair (e.g. a non-matrix product, or a snapshot missing one of the two).
   */
  @Prop({ type: String, default: null }) variationKey!: string | null;
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
class ReturnedItem {
  @Prop({ type: String, required: true }) productId!: string;
  @Prop({ type: String, default: null }) variantId!: string | null;
  @Prop({ type: String, required: true }) name!: string;
  @Prop({ type: Number, required: true }) qty!: number;
}
const ReturnedItemSchema = SchemaFactory.createForClass(ReturnedItem);

@Schema({ _id: false })
export class ReturnRecord {
  @Prop({ type: Date, required: true, default: () => new Date() }) returnedAt!: Date;
  @Prop({ type: Object, required: true }) returnedBy!: { type: string; id: string | null; name: string };
  @Prop({ type: String, default: null }) trackingNumber!: string | null;
  @Prop({ type: String, default: null }) carrier!: string | null;
  @Prop({ type: String, default: null }) reason!: string | null;
  @Prop({ type: String, default: null }) note!: string | null;
  @Prop({ type: Boolean, required: true, default: false }) stockRestored!: boolean;
  @Prop({ type: [ReturnedItemSchema], default: [] }) itemsReturned!: ReturnedItem[];
  @Prop({ type: [String], default: [] }) stockMovementIds!: string[];
}
export const ReturnRecordSchema = SchemaFactory.createForClass(ReturnRecord);

@Schema({ collection: 'orders', timestamps: true })
export class Order {
  @Prop({ type: Boolean, default: null }) stockCommitted!: boolean | null;
  @Prop({ type: Number, required: true, unique: true, index: true })
  orderNumber!: number;

  @Prop({ type: String, required: true, index: true })
  status!: string;

  @Prop({ type: [StatusHistoryEntrySchema], default: [] })
  statusHistory!: StatusHistoryEntry[];

  @Prop({ type: ReturnRecordSchema, default: null })
  returnInfo!: ReturnRecord | null;

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

  @Prop({ type: String, default: '' }) privateNote!: string;
  @Prop({ type: Boolean, default: false }) exchange!: boolean;
  @Prop({ type: Number, default: 0 }) attempts!: number;
  @Prop({ type: String, default: '' }) source!: string;
  @Prop({ type: String, enum: ['cod', 'card'], default: 'cod' }) paymentMethod!: 'cod' | 'card';

  /** Client-generated key that makes order creation idempotent (double-tap/retry safe). */
  @Prop({ type: String, unique: true, sparse: true })
  idempotencyKey?: string;

  /** Optimistic-concurrency counter. Bumped on every employee/admin write
   *  (update/changeStatus); the update DTO carries the version the editor
   *  loaded, and a mismatch aborts the write with 409 so two employees can
   *  never silently overwrite each other. Legacy docs default to 0. */
  @Prop({ type: Number, default: 0 })
  version!: number;

  @Prop({ type: String, unique: true, sparse: true })
  legacyId?: string;

  @Prop({ type: Date, default: null })
  confirmedAt?: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type OrderDocument = HydratedDocument<Order>;
export const OrderSchema = SchemaFactory.createForClass(Order);

/**
 * Keeps each item's `variationKey` in sync with its `variation` snapshot
 * on every save, regardless of which code path wrote `items` (checkout
 * create, draft upsert, admin update all end in `.save()`/`Model.create()`,
 * both of which run `pre('save')`). Centralizing this here means no
 * order-item-construction call site needs to remember to compute it —
 * see order-variation-key.ts for the normalization this reuses.
 */
OrderSchema.pre('save', function (next) {
  if (this.isModified('items')) {
    for (const item of this.items) item.variationKey = computeVariationKey(item.variation);
  }
  next();
});

OrderSchema.index({ status: 1, createdAt: -1 });
OrderSchema.index({ status: 1, confirmedAt: -1, createdAt: -1 });
OrderSchema.index({ status: 1, confirmedAt: 1, createdAt: 1 });
OrderSchema.index({ 'customer.phone': 1, createdAt: -1 });
OrderSchema.index({ createdAt: -1 });
// Supports the backend product filter: db.orders.find({ 'items.productId': <id> })
// Combined with status and createdAt so the planner can use it for the most
// common filtered+sorted queries without a separate collection scan.
OrderSchema.index({ 'items.productId': 1, status: 1, createdAt: -1 });
// Product+variant filter (new-format orders): matches items.variantId
// directly. Sparse-equivalent in effect since most historical items have
// variantId=null, but a plain index still serves the equality lookup fine.
OrderSchema.index({ 'items.variantId': 1 });
// Product+variant filter (legacy orders, no variantId): matches the
// normalized size/color snapshot key instead — see order-variation-key.ts.
OrderSchema.index({ 'items.variationKey': 1 });
OrderSchema.index({ 'carrier.navex.tracking': 1 }, { sparse: true });
OrderSchema.index({ 'carrier.firstdelivery.tracking': 1 }, { sparse: true });
OrderSchema.index({ 'carrier.axess.tracking': 1 }, { sparse: true });
OrderSchema.index({ 'returnInfo.trackingNumber': 1 }, { sparse: true });
