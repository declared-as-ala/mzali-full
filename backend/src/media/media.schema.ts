import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ _id: false })
class MediaVariant {
  @Prop({ type: String, enum: ['thumb', 'md', 'webp'], required: true })
  name!: 'thumb' | 'md' | 'webp';

  @Prop({ type: String, required: true })
  objectKey!: string;

  @Prop({ type: Number, required: true })
  width!: number;

  @Prop({ type: Number, required: true })
  height!: number;

  @Prop({ type: Number, required: true })
  size!: number;
}
const MediaVariantSchema = SchemaFactory.createForClass(MediaVariant);

@Schema({ collection: 'media', timestamps: true })
export class Media {
  @Prop({ type: String, required: true })
  bucket!: string;

  @Prop({ type: String, required: true })
  objectKey!: string;

  @Prop({ type: String, required: true })
  mime!: string;

  @Prop({ type: Number, required: true })
  size!: number;

  /** sha256 of the original file — used for upload dedupe. */
  @Prop({ type: String, required: true })
  checksum!: string;

  @Prop({ type: Number, default: 0 })
  width!: number;

  @Prop({ type: Number, default: 0 })
  height!: number;

  @Prop({ type: String, default: '' })
  alt!: string;

  @Prop({ type: [MediaVariantSchema], default: [] })
  variants!: MediaVariant[];

  /** Legacy wp-content URL, set only by the WooCommerce media migration. */
  @Prop({ type: String, default: null, index: { sparse: true } })
  originalUrl!: string | null;

  @Prop({ type: String, default: null })
  createdBy!: string | null;

  /** Set after a successful detach. A later garbage-collection pass may
   * delete it after all entity reference checks have passed. */
  @Prop({ type: Date, default: Date.now, index: true })
  orphanedAt!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type MediaDocument = HydratedDocument<Media>;
export const MediaSchema = SchemaFactory.createForClass(Media);
MediaSchema.index({ bucket: 1, checksum: 1 }, { unique: true });
