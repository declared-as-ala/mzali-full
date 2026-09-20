import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/** One accounting day across all terminals. The snapshot is written only at finalization. */
@Schema({ collection: 'pos_daily_z', timestamps: true })
export class PosDailyZ {
  @Prop({ type: String, required: true, unique: true }) date!: string;
  @Prop({ type: String, enum: ['OPEN', 'CLOSED'], default: 'OPEN' }) status!: 'OPEN' | 'CLOSED';
  @Prop({ type: Number, default: 0 }) revision!: number;
  @Prop({ type: Object, default: null }) snapshot!: Record<string, unknown> | null;
  @Prop({ type: String, default: null }) closedBy!: string | null;
  @Prop({ type: Date, default: null }) closedAt!: Date | null;
}
export const PosDailyZSchema = SchemaFactory.createForClass(PosDailyZ);
