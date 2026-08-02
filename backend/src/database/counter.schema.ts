import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/** Atomic sequence storage, e.g. { _id: 'orderNumber', seq: 10432 }. */
@Schema({ collection: 'counters' })
export class Counter {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ type: Number, required: true, default: 0 })
  seq!: number;
}

export const CounterSchema = SchemaFactory.createForClass(Counter);
