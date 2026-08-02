import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * A POS terminal must be paired + approved before it can process sales —
 * the employee JWT alone is not enough (see docs/pos-platform/security-model.md
 * §"POS terminal binding"). Pairing flow: device generates a fingerprint,
 * gets a short-lived `pairingCode`, polls until an admin approves it.
 */
@Schema({ collection: 'pos_terminals', timestamps: true })
export class PosTerminal {
  @Prop({ type: String, required: true, unique: true })
  terminalCode!: string;

  @Prop({ type: String, required: true })
  name!: string;

  @Prop({ type: String, required: true })
  locationId!: string;

  @Prop({ type: String, default: null })
  registerId!: string | null;

  @Prop({ type: Boolean, default: false })
  active!: boolean;

  @Prop({ type: String, required: true, index: true })
  deviceFingerprint!: string;

  /** Uniqueness enforced via a partial index below, not `sparse` — see the
   *  identical fix on Variant.barcode (backend/src/catalog/variant.schema.ts):
   *  a sparse index only excludes documents where the field is absent, but
   *  this field is explicitly set to `null` once consumed, which a
   *  sparse+unique index still collides on across terminals. */
  @Prop({ type: String, default: null })
  pairingCode!: string | null;

  @Prop({ type: Date, default: null })
  pairingCodeExpiresAt!: Date | null;

  @Prop({ type: Date, default: null })
  lastSeenAt!: Date | null;

  @Prop({ type: String, default: null })
  lastIp!: string | null;

  @Prop({ type: String, default: null })
  appVersion!: string | null;

  @Prop({ type: Date, default: null })
  approvedAt!: Date | null;

  @Prop({ type: String, default: null })
  approvedBy!: string | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type PosTerminalDocument = HydratedDocument<PosTerminal>;
export const PosTerminalSchema = SchemaFactory.createForClass(PosTerminal);
PosTerminalSchema.index({ pairingCode: 1 }, { unique: true, partialFilterExpression: { pairingCode: { $type: 'string' } } });
