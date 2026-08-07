import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * Tracks which physical till a sale/session belongs to, and that till's own
 * hardware configuration (currently: the receipt printer). No pairing/
 * approval gate anymore — PosTerminalsService.validate() silently
 * provisions a record for whatever terminal code + device fingerprint a
 * logged-in employee's browser presents; the employee JWT is the actual
 * access control. `pairingCode`/`pairingCodeExpiresAt`/`approvedAt`/
 * `approvedBy` are legacy columns from when that gate existed — left in
 * place (existing documents still have them) but no longer read for access
 * decisions.
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

  // ── Receipt printer configuration (per terminal) ──────────────────────
  /** Windows printer name as returned by `Get-Printer`, or null until the
   *  cashier configures one from the printer-settings screen. */
  @Prop({ type: String, default: null })
  printerName!: string | null;

  @Prop({ type: Number, enum: [58, 80], default: 80 })
  paperWidthMm!: 58 | 80;

  @Prop({ type: Number, default: 1, min: 1, max: 5 })
  printCopies!: number;

  @Prop({ type: Boolean, default: true })
  autoPrint!: boolean;

  @Prop({ type: Boolean, default: true })
  autoOpenDrawer!: boolean;

  @Prop({ type: Boolean, default: true })
  printLogo!: boolean;

  @Prop({ type: Boolean, default: true })
  printQr!: boolean;

  createdAt!: Date;
  updatedAt!: Date;
}

export type PosTerminalDocument = HydratedDocument<PosTerminal>;
export const PosTerminalSchema = SchemaFactory.createForClass(PosTerminal);
PosTerminalSchema.index({ pairingCode: 1 }, { unique: true, partialFilterExpression: { pairingCode: { $type: 'string' } } });
