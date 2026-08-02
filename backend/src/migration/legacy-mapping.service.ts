import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { LegacyMapping, MappingSourceSystem } from './legacy-mapping.schema';

export type ResolveResult =
  | { action: 'skip'; newId: string | null }
  | { action: 'proceed'; existingNewId: string | null };

@Injectable()
export class LegacyMappingService {
  constructor(@InjectModel(LegacyMapping.name) private readonly model: Model<LegacyMapping>) {}

  /**
   * Decide whether an entity needs (re-)importing. Unchanged checksum on an
   * already-migrated record ⇒ skip (idempotent re-runs do nothing); anything
   * else ⇒ proceed, returning the previously assigned newId (if any) so the
   * importer can update-in-place instead of creating a duplicate.
   */
  async resolve(
    sourceSystem: MappingSourceSystem,
    entityType: string,
    legacyId: string,
    checksum: string,
  ): Promise<ResolveResult> {
    const existing = await this.model.findOne({ sourceSystem, entityType, legacyId });
    if (existing && existing.status === 'migrated' && existing.checksum === checksum) {
      return { action: 'skip', newId: existing.newId };
    }
    return { action: 'proceed', existingNewId: existing?.newId ?? null };
  }

  async recordMigrated(
    sourceSystem: MappingSourceSystem,
    entityType: string,
    legacyId: string,
    newId: string,
    checksum: string,
  ): Promise<void> {
    await this.model.findOneAndUpdate(
      { sourceSystem, entityType, legacyId },
      { newId, checksum, status: 'migrated', error: null, migratedAt: new Date() },
      { upsert: true },
    );
  }

  async recordFailed(
    sourceSystem: MappingSourceSystem,
    entityType: string,
    legacyId: string,
    checksum: string,
    error: string,
  ): Promise<void> {
    await this.model.findOneAndUpdate(
      { sourceSystem, entityType, legacyId },
      { checksum, status: 'failed', error, migratedAt: null },
      { upsert: true },
    );
  }

  async recordSkipped(
    sourceSystem: MappingSourceSystem,
    entityType: string,
    legacyId: string,
    checksum: string,
    reason: string,
  ): Promise<void> {
    await this.model.findOneAndUpdate(
      { sourceSystem, entityType, legacyId },
      { checksum, status: 'skipped', error: reason, migratedAt: null },
      { upsert: true },
    );
  }

  /** Resolve a legacy id to its migrated newId (for cross-entity references). */
  async getNewId(sourceSystem: MappingSourceSystem, entityType: string, legacyId: string): Promise<string | null> {
    const doc = await this.model.findOne({ sourceSystem, entityType, legacyId, status: 'migrated' });
    return doc?.newId ?? null;
  }

  async countByStatus(entityType: string): Promise<Record<string, number>> {
    const rows = await this.model.aggregate<{ _id: string; count: number }>([
      { $match: { entityType } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    const out: Record<string, number> = {};
    for (const r of rows) out[r._id] = r.count;
    return out;
  }

  async failedEntries(entityType: string): Promise<LegacyMapping[]> {
    return this.model.find({ entityType, status: 'failed' });
  }
}
