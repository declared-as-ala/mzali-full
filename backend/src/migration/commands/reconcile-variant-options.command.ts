import { Command, CommandRunner, Option } from 'nest-commander';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import { Product } from '@/catalog/product.schema';
import { ProductVariantsService } from '@/catalog/product-variants.service';

type Options = { dryRun?: boolean; product?: string };

/**
 * Repairs products whose variants no longer match their saved options —
 * data left behind before saving options started reconciling variants
 * (see ProductVariantsService.reconcileWithOptions).
 *
 * Only ever switches variants off (active=false, obsoleteByOptions=true);
 * nothing is deleted or retired, so orders / stock items / movements that
 * reference them stay intact. Idempotent. Run with --dry-run first.
 *
 *   node dist/cli.js reconcile:variant-options --dry-run
 *   node dist/cli.js reconcile:variant-options --product bagy-marbrer
 */
@Command({ name: 'reconcile:variant-options', description: 'Deactivate variants whose size/color is no longer a current product option' })
export class ReconcileVariantOptionsCommand extends CommandRunner {
  constructor(
    @InjectModel(Product.name) private readonly products: Model<Product>,
    private readonly variants: ProductVariantsService,
  ) {
    super();
  }

  @Option({ flags: '--dry-run', description: 'Report only, write zero data' })
  parseDryRun(): boolean {
    return true;
  }

  @Option({ flags: '--product <slugOrId>', description: 'Limit to one product (slug or id)' })
  parseProduct(value: string): string {
    return value;
  }

  async run(_params: string[], options: Options): Promise<void> {
    const filter: Record<string, unknown> = { deletedAt: null, inventoryModel: 'MATRIX' };
    if (options.product) {
      Object.assign(filter, isValidObjectId(options.product) ? { $or: [{ _id: options.product }, { slug: options.product }] } : { slug: options.product });
    }
    const docs = await this.products.find(filter).select({ name: 1, slug: 1 });
    let deactivated = 0;
    let reactivated = 0;
    for (const p of docs) {
      const r = await this.variants.reconcileWithOptions(p.id, { dryRun: options.dryRun });
      if (r.skipped) { console.log(`- ${p.slug}: skipped (${r.skipped})`); continue; }
      for (const c of r.deactivated) console.log(`${options.dryRun ? '[dry-run] ' : ''}${p.slug}: OFF ${c.size} / ${c.color} (${c.sku})`);
      for (const c of r.reactivated) console.log(`${options.dryRun ? '[dry-run] ' : ''}${p.slug}: ON  ${c.size} / ${c.color} (${c.sku})`);
      deactivated += r.deactivated.length;
      reactivated += r.reactivated.length;
    }
    console.log(`reconcile:variant-options — products=${docs.length} deactivated=${deactivated} reactivated=${reactivated}${options.dryRun ? ' (dry-run)' : ''}`);
  }
}
