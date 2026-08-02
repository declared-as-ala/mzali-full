import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/** A cash register at a location; a terminal is assigned to one. Cashier
 *  sessions (Sprint 3) open against a register, not a terminal directly. */
@Schema({ collection: 'pos_registers', timestamps: true })
export class PosRegister {
  @Prop({ type: String, required: true, unique: true })
  code!: string;

  @Prop({ type: String, required: true })
  name!: string;

  @Prop({ type: String, required: true })
  locationId!: string;

  @Prop({ type: Boolean, default: true })
  active!: boolean;

  createdAt!: Date;
  updatedAt!: Date;
}

export type PosRegisterDocument = HydratedDocument<PosRegister>;
export const PosRegisterSchema = SchemaFactory.createForClass(PosRegister);
