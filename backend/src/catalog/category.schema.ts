import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ collection: 'categories', timestamps: true })
export class Category {
  @Prop({ type: String, required: true, unique: true, index: true })
  slug!: string;

  @Prop({ type: String, required: true })
  name!: string;

  @Prop({ type: String, default: null, index: true })
  parentId!: string | null;

  @Prop({ type: String, default: '' })
  description!: string;

  @Prop({ type: String, default: null })
  imageUrl!: string | null;

  @Prop({ type: String, default: null })
  mediaId!: string | null;

  @Prop({ type: Number, default: 0 })
  menuOrder!: number;

  /** Denormalized count of published products; recomputable, not authoritative. */
  @Prop({ type: Number, default: 0 })
  productCount!: number;

  @Prop({ type: String, unique: true, sparse: true })
  legacyId?: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export type CategoryDocument = HydratedDocument<Category>;
export const CategorySchema = SchemaFactory.createForClass(Category);
