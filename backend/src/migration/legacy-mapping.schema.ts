import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type MappingSourceSystem = 'woocommerce' | 'file';
export type MappingStatus = 'pending' | 'migrated' | 'failed' | 'skipped';

@Schema({ collection: 'legacy_mappings', timestamps: false })
export class LegacyMapping {
  @Prop({ type: String, enum: ['woocommerce', 'file'], required: true })
  sourceSystem!: MappingSourceSystem;

  @Prop({ type: String, required: true })
  entityType!: string;

  @Prop({ type: String, required: true })
  legacyId!: string;

  @Prop({ type: String, default: null })
  newId!: string | null;

  @Prop({ type: String, required: true })
  checksum!: string;

  @Prop({ type: String, enum: ['pending', 'migrated', 'failed', 'skipped'], required: true })
  status!: MappingStatus;

  @Prop({ type: String, default: null })
  error!: string | null;

  @Prop({ type: Date, default: null })
  migratedAt!: Date | null;
}

export type LegacyMappingDocument = HydratedDocument<LegacyMapping>;
export const LegacyMappingSchema = SchemaFactory.createForClass(LegacyMapping);
LegacyMappingSchema.index({ sourceSystem: 1, entityType: 1, legacyId: 1 }, { unique: true });
