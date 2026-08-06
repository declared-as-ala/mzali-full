import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

/**
 * Refresh-token session records. Only SHA-256 hashes of tokens are stored.
 * Rotation: each refresh marks the old record replaced and inserts a new one
 * in the same family; presenting an already-replaced token is treated as
 * theft and revokes the whole family.
 */
@Schema({ collection: 'sessions', timestamps: true })
export class Session {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ type: String, required: true, unique: true })
  refreshTokenHash!: string;

  @Prop({ type: String, required: true, index: true })
  familyId!: string;

  /** TTL index — MongoDB purges expired sessions automatically. */
  @Prop({ type: Date, required: true, index: { expireAfterSeconds: 0 } })
  expiresAt!: Date;

  @Prop({ type: String, default: null })
  ip!: string | null;

  @Prop({ type: String, default: null })
  userAgent!: string | null;

  @Prop({ type: Date, default: null })
  revokedAt!: Date | null;

  @Prop({ type: String, enum: ['rotated', 'logout', 'logout_all', 'password_reset', 'account_disabled'], default: null })
  revokedReason!: 'rotated' | 'logout' | 'logout_all' | 'password_reset' | 'account_disabled' | null;

  @Prop({ type: String, default: null })
  replacedByHash!: string | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type SessionDocument = HydratedDocument<Session>;
export const SessionSchema = SchemaFactory.createForClass(Session);
