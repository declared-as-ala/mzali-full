import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/** Key/value settings document, e.g. { _id: 'site', value: {...} }. */
@Schema({ collection: 'settings', timestamps: true })
export class Setting {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ type: Object, required: true })
  value!: Record<string, unknown>;

  updatedAt!: Date;
}

export type SettingDocument = HydratedDocument<Setting>;
export const SettingSchema = SchemaFactory.createForClass(Setting);
