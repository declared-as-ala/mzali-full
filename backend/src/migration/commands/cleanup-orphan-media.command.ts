import { Command, CommandRunner, Option } from 'nest-commander';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Category } from '@/catalog/category.schema';
import { Product } from '@/catalog/product.schema';
import { MediaService } from '@/media/media.service';

type Options = { dryRun?: boolean; olderThanHours?: number };

@Command({ name: 'cleanup:orphan-media', description: 'Safely delete aged media that no product or category references' })
export class CleanupOrphanMediaCommand extends CommandRunner {
  constructor(
    @InjectModel(Product.name) private readonly products: Model<Product>,
    @InjectModel(Category.name) private readonly categories: Model<Category>,
    private readonly media: MediaService,
  ) { super(); }

  @Option({ flags: '--dry-run', description: 'Report without deleting' })
  parseDryRun(): boolean { return true; }

  @Option({ flags: '--older-than-hours <hours>', description: 'Grace period for abandoned uploads (default 24)' })
  parseOlderThanHours(value: string): number { return Math.max(1, Number(value) || 24); }

  async run(_params: string[], options: Options): Promise<void> {
    const hours = options.olderThanHours ?? 24;
    const candidates = await this.media.findOrphanIdsBefore(new Date(Date.now() - hours * 60 * 60 * 1000));
    let deleted = 0;
    let referenced = 0;
    for (const mediaId of candidates) {
      const [productRefs, categoryRefs] = await Promise.all([
        this.products.countDocuments({ 'images.mediaId': mediaId, deletedAt: null }),
        this.categories.countDocuments({ mediaId }),
      ]);
      if (productRefs + categoryRefs > 0) { referenced += 1; continue; }
      if (options.dryRun) console.log(`[dry-run] orphan media ${mediaId}`);
      else if (await this.media.deleteOrphaned(mediaId)) deleted += 1;
    }
    console.log(`cleanup:orphan-media candidates=${candidates.length} referenced=${referenced} deleted=${deleted}${options.dryRun ? ' (dry-run)' : ''}`);
  }
}
