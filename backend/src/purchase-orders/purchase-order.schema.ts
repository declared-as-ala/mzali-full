import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export const PURCHASE_ORDER_STATUSES = [
  'DRAFT', 'SUBMITTED', 'CONFIRMED_BY_SUPPLIER', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED', 'CLOSED',
] as const;
export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];

@Schema({ _id: false })
class PurchaseOrderActor {
  @Prop({ type: String, enum: ['system', 'employee', 'migration', 'service'], required: true })
  type!: 'system' | 'employee' | 'migration' | 'service';
  @Prop({ type: String, default: null }) id!: string | null;
  @Prop({ type: String, required: true }) name!: string;
}
const PurchaseOrderActorSchema = SchemaFactory.createForClass(PurchaseOrderActor);

@Schema({ _id: false })
export class PurchaseOrderLine {
  @Prop({ type: String, required: true }) variantId!: string;
  @Prop({ type: String, default: null }) supplierSku!: string | null;
  /** Product+variant name at PO time — immutable, never re-derived from the live catalog. */
  @Prop({ type: String, required: true }) descriptionSnapshot!: string;
  @Prop({ type: Number, required: true }) orderedQuantity!: number;
  /** Denormalized running total — source of truth is goods_receipts, this is kept in sync by GoodsReceiptsService.post() only. */
  @Prop({ type: Number, required: true, default: 0 }) receivedQuantity!: number;
  @Prop({ type: Number, required: true }) unitCostMinor!: number;
  @Prop({ type: Number, required: true, default: 0 }) discountMinor!: number;
  @Prop({ type: Number, required: true, default: 0 }) taxMinor!: number;
  @Prop({ type: Number, required: true }) lineTotalMinor!: number;
}
const PurchaseOrderLineSchema = SchemaFactory.createForClass(PurchaseOrderLine);

@Schema({ _id: false })
class PurchaseOrderStatusHistoryEntry {
  @Prop({ type: String, default: null }) from!: string | null;
  @Prop({ type: String, required: true }) to!: string;
  @Prop({ type: PurchaseOrderActorSchema, required: true }) by!: PurchaseOrderActor;
  @Prop({ type: Date, required: true }) at!: Date;
}
const PurchaseOrderStatusHistoryEntrySchema = SchemaFactory.createForClass(PurchaseOrderStatusHistoryEntry);

/**
 * PurchaseOrdersService never calls StockLedgerService — stock only moves
 * at goods-receipt posting. See docs/pos-platform/supplier-management.md
 * "The one rule that matters most".
 */
@Schema({ collection: 'purchase_orders', timestamps: true })
export class PurchaseOrder {
  @Prop({ type: Number, required: true, unique: true })
  purchaseOrderNumber!: number;

  @Prop({ type: String, required: true, index: true })
  supplierId!: string;

  @Prop({ type: String, required: true, uppercase: true })
  destinationLocationId!: string;

  @Prop({ type: Date, required: true })
  orderDate!: Date;

  @Prop({ type: Date, default: null })
  expectedDeliveryDate!: Date | null;

  @Prop({ type: String, required: true, default: 'TND' })
  currency!: 'TND';

  @Prop({ type: [PurchaseOrderLineSchema], default: [] })
  lines!: PurchaseOrderLine[];

  @Prop({ type: Number, required: true, default: 0 })
  subtotalMinor!: number;

  @Prop({ type: Number, required: true, default: 0 })
  discountMinor!: number;

  @Prop({ type: Number, required: true, default: 0 })
  taxMinor!: number;

  @Prop({ type: Number, required: true, default: 0 })
  shippingMinor!: number;

  @Prop({ type: Number, required: true, default: 0 })
  totalMinor!: number;

  @Prop({ type: String, default: null })
  paymentTerms!: string | null;

  @Prop({ type: String, default: null })
  internalNotes!: string | null;

  @Prop({ type: String, default: null })
  supplierNotes!: string | null;

  @Prop({ type: String, enum: PURCHASE_ORDER_STATUSES, required: true, default: 'DRAFT', index: true })
  status!: PurchaseOrderStatus;

  @Prop({ type: [PurchaseOrderStatusHistoryEntrySchema], default: [] })
  statusHistory!: PurchaseOrderStatusHistoryEntry[];

  @Prop({ type: PurchaseOrderActorSchema, required: true })
  createdBy!: PurchaseOrderActor;

  @Prop({ type: PurchaseOrderActorSchema, default: null })
  approvedBy!: PurchaseOrderActor | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type PurchaseOrderDocument = HydratedDocument<PurchaseOrder>;
export const PurchaseOrderSchema = SchemaFactory.createForClass(PurchaseOrder);
PurchaseOrderSchema.index({ supplierId: 1, status: 1 });
