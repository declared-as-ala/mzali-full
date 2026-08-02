import { Command, CommandRunner, Option } from 'nest-commander';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Category } from '@/catalog/category.schema';
import { checksumOf } from '../checksum';
import { mapWooCategory } from '../mappers/map-category';
import { LegacyMappingService } from '../legacy-mapping.service';
import { writeReport } from '../report-writer';
import { WooCategoryRaw } from '../woo-types';
import { WooClientService } from '../woo-client.service';

type Options = { dryRun?: boolean; since?: string; limit?: number };

@Command({ name: 'migrate:categories', description: 'Import WooCommerce categories into MongoDB' })
export class MigrateCategoriesCommand extends CommandRunner {
  constructor(
    private readonly woo: WooClientService,
    private readonly mappings: LegacyMappingService,
    @InjectModel(Category.name) private readonly categories: Model<Category>,
  ) {
    super();
  }

  @Option({ flags: '--dry-run', description: 'Report only, write zero data' })
  parseDryRun(): boolean {
    return true;
  }
  @Option({ flags: '--since <iso>', description: 'Only categories modified since this ISO timestamp' })
  parseSince(val: string): string {
    return val;
  }
  @Option({ flags: '--limit <n>', description: 'Stop after this many source records' })
  parseLimit(val: string): number {
    return Number(val);
  }

  async run(_params: string[], options: Options): Promise<void> {
    const report = { created: 0, updated: 0, skipped: 0, failed: 0, errors: [] as { legacyId: string; error: string }[] };
    let count = 0;

    for await (const page of this.woo.paginate<WooCategoryRaw>('/products/categories', {
      modified_after: options.since,
    })) {
      for (const raw of page) {
        if (options.limit && count >= options.limit) break;
        count += 1;
        const mapped = mapWooCategory(raw);
        // Checksum the mapped output, not the raw Woo blob (see migrate-products
        // for why: volatile unrelated fields would defeat idempotency).
        const checksum = checksumOf(mapped);
        try {
          const resolution = await this.mappings.resolve('woocommerce', 'category', mapped.legacyId, checksum);
          if (resolution.action === 'skip') {
            report.skipped += 1;
            continue;
          }
          if (options.dryRun) {
            if (resolution.existingNewId) report.updated += 1;
            else report.created += 1;
            continue;
          }
          const doc = await this.categories.findOneAndUpdate(
            { legacyId: mapped.legacyId },
            {
              $set: {
                name: mapped.name,
                slug: mapped.slug,
                description: mapped.description,
                imageUrl: mapped.imageUrl,
                menuOrder: mapped.menuOrder,
              },
            },
            { upsert: true, new: true },
          );
          if (resolution.existingNewId) report.updated += 1;
          else report.created += 1;
          await this.mappings.recordMigrated('woocommerce', 'category', mapped.legacyId, doc.id, checksum);
        } catch (err) {
          report.failed += 1;
          const message = err instanceof Error ? err.message : String(err);
          report.errors.push({ legacyId: mapped.legacyId, error: message });
          await this.mappings.recordFailed('woocommerce', 'category', mapped.legacyId, checksum, message);
        }
      }
      if (options.limit && count >= options.limit) break;
    }

    // Second pass: resolve parent relationships now that every category has a newId.
    if (!options.dryRun) {
      const allRaw: WooCategoryRaw[] = [];
      for await (const page of this.woo.paginate<WooCategoryRaw>('/products/categories', { modified_after: options.since })) {
        allRaw.push(...page);
        if (options.limit && allRaw.length >= options.limit) break;
      }
      for (const raw of allRaw) {
        const mapped = mapWooCategory(raw);
        if (!mapped.parentLegacyId) continue;
        const parentNewId = await this.mappings.getNewId('woocommerce', 'category', mapped.parentLegacyId);
        if (!parentNewId) continue;
        await this.categories.updateOne({ legacyId: mapped.legacyId }, { $set: { parentId: parentNewId } });
      }
    }

    const path = await writeReport('migrate-categories', { options, report });
    console.log(`migrate:categories — created=${report.created} updated=${report.updated} skipped=${report.skipped} failed=${report.failed}`);
    console.log(`Report: ${path}`);
  }
}
