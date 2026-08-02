import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export const SUPPLIER_PO_STATUSES = ['DRAFT', 'SENT', 'COMPLETED', 'CANCELLED'] as const;
export type SupplierPurchaseOrderStatus = (typeof SUPPLIER_PO_STATUSES)[number];

@Schema({ _id: false })
class SupplierPurchaseOrderActor {
  @Prop({ type: String, enum: ['system', 'employee', 'migration', 'service'], required: true })
  type!: 'system' | 'employee' | 'migration' | 'service';
  @Prop({ type: String, default: null }) id!: string | null;
  @Prop({ type: String, required: true }) name!: string;
}
const SupplierPurchaseOrderActorSchema = SchemaFactory.createForClass(SupplierPurchaseOrderActor);

@Schema({ _id: false })
export class SupplierPurchaseOrderLine {
  /** Nullable — a line can be free-typed without an existing catalog entry. */
  @Prop({ type: String, default: null }) supplierProductId!: string | null;
  @Prop({ type: String, required: true }) name!: string;
  @Prop({ type: String, default: null }) category!: string | null;
  @Prop({ type: String, default: null }) brand!: string | null;
  @Prop({ type: String, default: null }) size!: string | null;
  @Prop({ type: String, default: null }) color!: string | null;
  @Prop({ type: Number, required: true }) quantity!: number;
  @Prop({ type: Number, required: true }) unitPriceMinor!: number;
  @Prop({ type: Number, required: true }) lineTotalMinor!: number;
}
const SupplierPurchaseOrderLineSchema = SchemaFactory.createForClass(SupplierPurchaseOrderLine);

/**
 * A lightweight, print-only purchase order. Deliberately NOT the ERP
 * purchase_orders collection (that one is variantId/receivedQuantity-coupled
 * to the store's own inventory — see purchase-order.schema.ts). This one
 * never touches stock, inventory, or accounting: statuses are organizational
 * labels only. Stock is always adjusted manually from the Stock page.
 */
@Schema({ collection: 'supplier_purchase_orders', timestamps: true })
export class SupplierPurchaseOrder {
  @Prop({ type: Number, required: true, unique: true })
  poNumber!: number;

  @Prop({ type: String, required: true, index: true })
  supplierId!: string;

  @Prop({ type: Date, required: true })
  orderDate!: Date;

  @Prop({ type: [SupplierPurchaseOrderLineSchema], default: [] })
  lines!: SupplierPurchaseOrderLine[];

  @Prop({ type: Number, required: true, default: 0 })
  totalMinor!: number;

  @Prop({ type: String, default: null })
  notes!: string | null;

  @Prop({ type: String, enum: SUPPLIER_PO_STATUSES, required: true, default: 'DRAFT', index: true })
  status!: SupplierPurchaseOrderStatus;

  @Prop({ type: SupplierPurchaseOrderActorSchema, required: true })
  createdBy!: SupplierPurchaseOrderActor;

  @Prop({ type: String, default: null })
  pdfMediaId!: string | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type SupplierPurchaseOrderDocument = HydratedDocument<SupplierPurchaseOrder>;
export const SupplierPurchaseOrderSchema = SchemaFactory.createForClass(SupplierPurchaseOrder);
SupplierPurchaseOrderSchema.index({ supplierId: 1, createdAt: -1 });
