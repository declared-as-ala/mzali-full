import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type { AuditActor } from '@contracts';

@Schema({ _id: false })
class Actor {
  @Prop({ type: String, enum: ['employee', 'system', 'migration', 'service'], required: true })
  type!: AuditActor['type'];

  @Prop({ type: String, default: null })
  id!: string | null;

  @Prop({ type: String, required: true })
  name!: string;
}
const ActorSchema = SchemaFactory.createForClass(Actor);

/**
 * Append-only audit trail. No update/delete APIs exist for this collection;
 * sanitization happens in AuditService before insert.
 */
@Schema({ collection: 'audit_logs', timestamps: { createdAt: true, updatedAt: false } })
export class AuditLog {
  @Prop({ type: ActorSchema, required: true })
  actor!: Actor;

  @Prop({ type: String, required: true })
  action!: string;

  @Prop({ type: String, required: true })
  entityType!: string;

  @Prop({ type: String, default: null })
  entityId!: string | null;

  @Prop({ type: String, required: true })
  summary!: string;

  @Prop({ type: Object, default: null })
  before!: Record<string, unknown> | null;

  @Prop({ type: Object, default: null })
  after!: Record<string, unknown> | null;

  @Prop({ type: String, default: null })
  ip!: string | null;

  /** Populated only for POS-originated actions (see security-model.md
   *  "Audit log entries") — lets a review filter "what happened at
   *  BOUTIQUE-CAISSE-1 on date X" without cross-referencing sales. */
  @Prop({ type: String, default: null })
  locationId!: string | null;

  @Prop({ type: String, default: null })
  terminalCode!: string | null;

  createdAt!: Date;
}

export type AuditLogDocument = HydratedDocument<AuditLog>;
export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

AuditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
AuditLogSchema.index({ 'actor.id': 1, createdAt: -1 });
AuditLogSchema.index({ createdAt: -1 });
