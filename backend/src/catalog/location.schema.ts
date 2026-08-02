import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export const DEPOT_CODE = 'DEPOT';
export const BOUTIQUE_CODE = 'BOUTIQUE';

export type LocationType = 'WAREHOUSE' | 'STORE';

/**
 * `code` (e.g. 'DEPOT', 'BOUTIQUE') is the stable natural key every other
 * collection references via `locationId` — not the Mongo `_id`. Locations
 * are a tiny, rarely-changing set; using the code avoids a population/
 * lookup on every single stock query, matching how `warehouseId` already
 * worked as a plain string before this sprint.
 */
@Schema({ collection: 'locations', timestamps: true })
export class Location {
  @Prop({ type: String, required: true, unique: true, uppercase: true })
  code!: string;

  @Prop({ type: String, required: true })
  name!: string;

  @Prop({ type: String, enum: ['WAREHOUSE', 'STORE'], required: true })
  type!: LocationType;

  @Prop({ type: String, default: null })
  address!: string | null;

  @Prop({ type: Boolean, default: true })
  active!: boolean;

  @Prop({ type: Boolean, default: false })
  isDefaultOnlineLocation!: boolean;

  @Prop({ type: Boolean, default: false })
  isDefaultPosLocation!: boolean;

  @Prop({ type: Boolean, default: false })
  allowOnlineFulfillment!: boolean;

  @Prop({ type: Boolean, default: false })
  allowPosSales!: boolean;

  @Prop({ type: Boolean, default: false })
  allowNegativeStock!: boolean;

  createdAt!: Date;
  updatedAt!: Date;
}

export type LocationDocument = HydratedDocument<Location>;
export const LocationSchema = SchemaFactory.createForClass(Location);
