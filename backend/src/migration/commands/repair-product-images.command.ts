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
@Command({ name: 'repair:product-images', description: 'Normalize legacy product media ids, urls, order, duplicates and primary image' })
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
      const mediaIds = doc.images.map((img) => img.mediaId ?? (isValidObjectId(img.url) ? img.url : null)).filter((id): id is string => Boolean(id));
      const urlById = await this.media.getUrlsByIds(mediaIds);
      const resolvedImages = doc.images
        .map((img) => {
          if (!img.mediaId && !isValidObjectId(img.url)) return img;
          const resolved = urlById.get(img.mediaId ?? img.url);
          return resolved ? { mediaId: img.mediaId, url: resolved, alt: img.alt, position: img.position, isPrimary: img.isPrimary } : null;
        })
        .filter((img): img is NonNullable<typeof img> => img !== null);

      const seen = new Set<string>();
      const sorted = resolvedImages
        .map((image, originalIndex) => ({ image, originalIndex }))
        .sort((a, b) => (a.image.position ?? a.originalIndex) - (b.image.position ?? b.originalIndex));
      const deduplicated = sorted
        .map(({ image }) => image)
        .filter((image) => {
          const identity = image.mediaId ?? image.url;
          if (seen.has(identity)) return false;
          seen.add(identity);
          return true;
        });
      const requestedPrimary = deduplicated.findIndex((image) => Boolean(image.isPrimary));
      const primaryIndex = requestedPrimary >= 0 ? requestedPrimary : 0;
      const nextImages = deduplicated.map((image, position) => ({
        mediaId: image.mediaId,
        url: image.url,
        alt: image.alt,
        position,
        isPrimary: position === primaryIndex,
      }));

      const dropped = doc.images.length - nextImages.length;
      droppedImages += dropped;
      const changed = JSON.stringify(doc.images) !== JSON.stringify(nextImages);
      if (!changed) continue;
      fixed += 1;
      console.log(
        `${options.dryRun ? '[dry-run] ' : ''}product ${doc.id} (${doc.slug}): normalized ${nextImages.length} image(s)${dropped ? `, ${dropped} duplicate/unresolvable removed` : ''}`,
      );
      if (!options.dryRun) {
        doc.images = nextImages;
        await doc.save();
      }
    }

    console.log(`repair:product-images — scanned=${scanned} fixed=${fixed} unresolvable-dropped=${droppedImages}${options.dryRun ? ' (dry-run)' : ''}`);
  }
}
