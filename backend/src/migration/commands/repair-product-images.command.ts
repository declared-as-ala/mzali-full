import { Command, CommandRunner, Option } from 'nest-commander';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import { Product } from '@/catalog/product.schema';
import { MediaService } from '@/media/media.service';

type Options = { dryRun?: boolean };

/**
 * One-off repair for products saved before the imageIds→url resolution fix
 * in ProductsService (create()/update() used to store the bare media
 * document id as `url` instead of resolving it to the real MinIO URL — any
 * <img src> using it 404s against whatever page it's rendered on). Finds
 * every product whose image url is actually a media id and re-resolves it
 * to the real url; safe to re-run (a no-op once every product is fixed).
 */
@Command({ name: 'repair:product-images', description: 'Fix product image urls that were stored as bare media ids' })
export class RepairProductImagesCommand extends CommandRunner {
  constructor(
    @InjectModel(Product.name) private readonly products: Model<Product>,
    private readonly media: MediaService,
  ) {
    super();
  }

  @Option({ flags: '--dry-run', description: 'Report only, write zero data' })
  parseDryRun(): boolean {
    return true;
  }

  async run(_params: string[], options: Options): Promise<void> {
    const docs = await this.products.find({ 'images.0': { $exists: true } });
    let scanned = 0;
    let fixed = 0;
    let droppedImages = 0;

    for (const doc of docs) {
      scanned += 1;
      const brokenIds = doc.images.filter((img) => isValidObjectId(img.url)).map((img) => img.mediaId ?? img.url);
      if (brokenIds.length === 0) continue;

      const urlById = await this.media.getUrlsByIds(brokenIds);
      const nextImages = doc.images
        .map((img) => {
          if (!isValidObjectId(img.url)) return img;
          const resolved = urlById.get(img.mediaId ?? img.url);
          return resolved ? { mediaId: img.mediaId, url: resolved, alt: img.alt, position: img.position } : null;
        })
        .filter((img): img is NonNullable<typeof img> => img !== null);

      const dropped = doc.images.length - nextImages.length;
      droppedImages += dropped;
      fixed += 1;
      console.log(
        `${options.dryRun ? '[dry-run] ' : ''}product ${doc.id} (${doc.slug}): ${brokenIds.length} broken image(s)${dropped ? `, ${dropped} unresolvable (dropped)` : ''}`,
      );
      if (!options.dryRun) {
        doc.images = nextImages;
        await doc.save();
      }
    }

    console.log(`repair:product-images — scanned=${scanned} fixed=${fixed} unresolvable-dropped=${droppedImages}${options.dryRun ? ' (dry-run)' : ''}`);
  }
}
