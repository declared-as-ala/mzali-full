import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ _id: false })
class ProductImage {
  @Prop({ type: String, default: null })
  mediaId!: string | null;

  @Prop({ type: String, required: true })
  url!: string;

  @Prop({ type: String, default: '' })
  alt!: string;

  @Prop({ type: Number, default: 0 })
  position!: number;
}
const ProductImageSchema = SchemaFactory.createForClass(ProductImage);

@Schema({ _id: false })
class ProductOption {
  @Prop({ type: String, required: true })
  label!: string;

  @Prop({ type: String, enum: ['text', 'select', 'radio'], default: 'select' })
  type!: 'text' | 'select' | 'radio';

  @Prop({ type: [String], default: [] })
  values!: string[];
}
const ProductOptionSchema = SchemaFactory.createForClass(ProductOption);

@Schema({ _id: false })
class ProductBundle {
  @Prop({ type: String, required: true })
  id!: string;

  @Prop({ type: String, required: true })
  name!: string;

  @Prop({ type: String, default: null })
  label!: string | null;

  @Prop({ type: Number, required: true })
  regularPriceMinor!: number;

  @Prop({ type: Number, required: true })
  priceMinor!: number;

  @Prop({ type: Number, default: 0 })
  deliveryPriceMinor!: number;

  @Prop({ type: Number, default: 1 })
  quantity!: number;

  @Prop({ type: String, enum: ['red', 'green', 'blue', 'purple'], default: 'purple' })
  badgeColor!: 'red' | 'green' | 'blue' | 'purple';

  @Prop({ type: String, default: null })
  imageUrl!: string | null;

  @Prop({ type: Boolean, default: false })
  isDefault!: boolean;
}
const ProductBundleSchema = SchemaFactory.createForClass(ProductBundle);

export type ProductStatus = 'published' | 'draft' | 'private';

@Schema({ collection: 'products', timestamps: true })
export class Product {
  @Prop({ type: String, required: true, unique: true, index: true })
  slug!: string;

  @Prop({ type: String, required: true })
  name!: string;

  @Prop({ type: String, enum: ['published', 'draft', 'private'], default: 'draft', index: true })
  status!: ProductStatus;

  @Prop({ type: String, default: '' })
  description!: string;

  @Prop({ type: String, default: '' })
  shortDescription!: string;

  @Prop({ type: String, default: null })
  sku!: string | null;

  @Prop({ type: Number, required: true })
  regularPriceMinor!: number;

  @Prop({ type: Number, default: null })
  salePriceMinor!: number | null;

  @Prop({ type: String, default: 'TND' })
  currency!: string;

  @Prop({ type: Boolean, default: true })
  manageStock!: boolean;

  @Prop({ type: Number, default: null })
  stockQuantity!: number | null;

  @Prop({ type: [ProductImageSchema], default: [] })
  images!: ProductImage[];

  @Prop({ type: [String], default: [], index: true })
  categoryIds!: string[];

  @Prop({ type: [String], default: [] })
  categorySlugs!: string[];

  @Prop({ type: [ProductOptionSchema], default: [] })
  options!: ProductOption[];

  @Prop({ type: [ProductBundleSchema], default: [] })
  bundles!: ProductBundle[];

  @Prop({ type: [String], default: [] })
  upsellIds!: string[];

  @Prop({ type: [String], default: [] })
  crossSellIds!: string[];

  @Prop({ type: Number, default: 0 })
  costMinor!: number;

  @Prop({ type: Number, default: 0 })
  deliveryPriceMinor!: number;

  @Prop({ type: Number, default: 0 })
  deliveryCostMinor!: number;

  /** Which supplier this product is typically sourced from — used only to
   *  drive the "copy purchase price from supplier catalog" action on the
   *  product form; never affects stock. */
  @Prop({ type: String, default: null })
  supplierId!: string | null;

  @Prop({ type: Number, default: 0, index: true })
  menuOrder!: number;

  @Prop({ type: Number, default: 0 })
  totalSales!: number;

  @Prop({ type: Boolean, default: false })
  featured!: boolean;

  /** Sold only at the till — never listed on the storefront (shop/category/
   *  home/related) and rejected if ordered through online checkout, but
   *  still sellable in the POS and counted normally in stock/reports. */
  @Prop({ type: Boolean, default: false })
  posOnly!: boolean;

  @Prop({ type: String, unique: true, sparse: true })
  legacyId?: string;

  @Prop({ type: Date, default: null })
  deletedAt!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type ProductDocument = HydratedDocument<Product>;
export const ProductSchema = SchemaFactory.createForClass(Product);

ProductSchema.index({ status: 1, menuOrder: 1 });
ProductSchema.index({ categoryIds: 1, status: 1, menuOrder: 1 });
ProductSchema.index({ name: 'text' });
ProductSchema.index({ createdAt: -1 });
