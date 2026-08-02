import { Command, CommandRunner, Option } from 'nest-commander';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Category } from '@/catalog/category.schema';
import { DEPOT_CODE } from '@/catalog/location.schema';
import { Product } from '@/catalog/product.schema';
import { ProductVariantsService } from '@/catalog/product-variants.service';
import { Media } from '@/media/media.schema';
import { StockItem } from '@/inventory/stock-item.schema';
import { StockMovement } from '@/inventory/stock-movement.schema';
import { checksumOf } from '../checksum';
import { mapWooProduct } from '../mappers/map-product';
import { LegacyMappingService } from '../legacy-mapping.service';
import { writeReport } from '../report-writer';
import { WooProductRaw } from '../woo-types';
import { WooClientService } from '../woo-client.service';

type Options = { dryRun?: boolean; since?: string; limit?: number };

@Command({ name: 'migrate:products', description: 'Import WooCommerce products into MongoDB' })
export class MigrateProductsCommand extends CommandRunner {
  constructor(
    private readonly woo: WooClientService,
    private readonly mappings: LegacyMappingService,
    private readonly variants: ProductVariantsService,
    @InjectModel(Product.name) private readonly products: Model<Product>,
    @InjectModel(Category.name) private readonly categories: Model<Category>,
    @InjectModel(Media.name) private readonly media: Model<Media>,
    @InjectModel(StockItem.name) private readonly stockItems: Model<StockItem>,
    @InjectModel(StockMovement.name) private readonly stockMovements: Model<StockMovement>,
    private readonly config: ConfigService,
  ) {
    super();
  }

  @Option({ flags: '--dry-run', description: 'Report only, write zero data' })
  parseDryRun(): boolean {
    return true;
  }
  @Option({ flags: '--since <iso>', description: 'Only products modified since this ISO timestamp' })
  parseSince(val: string): string {
    return val;
  }
  @Option({ flags: '--limit <n>', description: 'Stop after this many source records' })
  parseLimit(val: string): number {
    return Number(val);
  }

  async run(_params: string[], options: Options): Promise<void> {
    const report = {
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      unresolvedMedia: [] as { productId: string; url: string }[],
      unresolvedCategories: [] as { productId: string; legacyCategoryId: string }[],
      errors: [] as { legacyId: string; error: string }[],
    };
    let count = 0;

    for await (const page of this.woo.paginate<WooProductRaw>('/products', { modified_after: options.since })) {
      for (const raw of page) {
        if (options.limit && count >= options.limit) break;
        count += 1;
        const mapped = mapWooProduct(raw);
        // Checksum the MAPPED output, not the raw Woo blob: the raw response
        // carries volatile fields we never read (ratings, permalink, related
        // id ordering, ...) that would otherwise make every re-run look
        // "changed" and defeat idempotency reporting on unmodified products.
        const checksum = checksumOf(mapped);
        try {
          const resolution = await this.mappings.resolve('woocommerce', 'product', mapped.legacyId, checksum);
          if (resolution.action === 'skip') {
            report.skipped += 1;
            continue;
          }
          if (options.dryRun) {
            if (resolution.existingNewId) report.updated += 1;
            else report.created += 1;
            continue;
          }

          const categoryIds: string[] = [];
          const categorySlugs: string[] = [];
          for (const legacyCategoryId of mapped.categoryLegacyIds) {
            const newId = await this.mappings.getNewId('woocommerce', 'category', legacyCategoryId);
            if (newId) {
              categoryIds.push(newId);
            } else {
              report.unresolvedCategories.push({ productId: mapped.legacyId, legacyCategoryId });
            }
          }
          if (categoryIds.length > 0) {
            const catDocs = await this.categories.find({ _id: { $in: categoryIds } }).select({ slug: 1 });
            for (const c of catDocs) categorySlugs.push(c.slug);
          }

          const minioPublicBase = this.config.getOrThrow<string>('MINIO_PUBLIC_URL').replace(/\/$/, '');
          const images: { mediaId: string | null; url: string; alt: string; position: number }[] = [];
          for (let i = 0; i < mapped.imageUrls.length; i++) {
            const url = mapped.imageUrls[i];
            const mediaDoc = await this.media.findOne({ originalUrl: url });
            if (mediaDoc) {
              // Object keys are bucket-relative, so public URLs include the bucket explicitly.
              images.push({ mediaId: mediaDoc.id, url: `${minioPublicBase}/${mediaDoc.bucket}/${mediaDoc.objectKey}`, alt: '', position: i });
            } else {
              images.push({ mediaId: null, url, alt: '', position: i });
              report.unresolvedMedia.push({ productId: mapped.legacyId, url });
            }
          }

          const doc = await this.products.findOneAndUpdate(
            { legacyId: mapped.legacyId },
            {
              $set: {
                name: mapped.name,
                slug: mapped.slug,
                status: mapped.status,
                description: mapped.description,
                shortDescription: mapped.shortDescription,
                regularPriceMinor: mapped.regularPriceMinor,
                salePriceMinor: mapped.salePriceMinor,
                currency: 'TND',
                manageStock: mapped.manageStock,
                stockQuantity: mapped.stockQuantity,
                categoryIds,
                categorySlugs,
                images,
                options: mapped.options,
                bundles: mapped.bundles,
                upsellIds: [], // resolved in a second pass once every product has a newId
                crossSellIds: [],
                costMinor: mapped.costMinor,
                deliveryPriceMinor: mapped.deliveryPriceMinor,
                deliveryCostMinor: mapped.deliveryCostMinor,
                menuOrder: mapped.menuOrder,
                totalSales: mapped.totalSales,
                featured: mapped.featured,
              },
            },
            { upsert: true, new: true },
          );

          // Every product needs exactly one variant (see docs/pos-platform/PLAN.md
          // decision D7) before it can carry stock — idempotent, no-op on rerun.
          const variant = await this.variants.generateDefaultVariant(doc.id);

          // Seed the inventory ledger from the Woo stock quantity (skip if already seeded).
          const alreadySeeded = await this.stockMovements.exists({ variantId: variant.id, type: 'migration_init' });
          if (!alreadySeeded) {
            const onHand = mapped.stockQuantity ?? 0;
            const item = await this.stockItems.findOneAndUpdate(
              { variantId: variant.id, locationId: DEPOT_CODE },
              { $set: { quantityOnHand: onHand, quantityReserved: 0 } },
              { upsert: true, new: true },
            );
            await this.stockMovements.create({
              variantId: variant.id,
              locationId: DEPOT_CODE,
              type: 'migration_init',
              qty: onHand,
              onHandAfter: item.quantityOnHand,
              reservedAfter: item.quantityReserved,
              orderId: null,
              reason: 'WooCommerce migration initial stock',
              actor: { type: 'migration', id: null, name: 'migrate:products' },
            });
          }

          if (resolution.existingNewId) report.updated += 1;
          else report.created += 1;
          await this.mappings.recordMigrated('woocommerce', 'product', mapped.legacyId, doc.id, checksum);
        } catch (err) {
          report.failed += 1;
          const message = err instanceof Error ? err.message : String(err);
          report.errors.push({ legacyId: mapped.legacyId, error: message });
          await this.mappings.recordFailed('woocommerce', 'product', mapped.legacyId, checksum, message);
        }
      }
      if (options.limit && count >= options.limit) break;
    }

    // Second pass: resolve upsell/cross-sell legacy product ids now that all products have a newId.
    if (!options.dryRun) {
      count = 0;
      for await (const page of this.woo.paginate<WooProductRaw>('/products', { modified_after: options.since })) {
        for (const raw of page) {
          if (options.limit && count >= options.limit) break;
          count += 1;
          const mapped = mapWooProduct(raw);
          const upsellIds = (await Promise.all(mapped.upsellLegacyIds.map((id) => this.mappings.getNewId('woocommerce', 'product', id)))).filter(
            (x): x is string => Boolean(x),
          );
          const crossSellIds = (await Promise.all(mapped.crossSellLegacyIds.map((id) => this.mappings.getNewId('woocommerce', 'product', id)))).filter(
            (x): x is string => Boolean(x),
          );
          if (upsellIds.length > 0 || crossSellIds.length > 0) {
            await this.products.updateOne({ legacyId: mapped.legacyId }, { $set: { upsellIds, crossSellIds } });
          }
        }
        if (options.limit && count >= options.limit) break;
      }
    }

    const path = await writeReport('migrate-products', { options, report: { ...report, unresolvedMediaCount: report.unresolvedMedia.length } });
    console.log(
      `migrate:products — created=${report.created} updated=${report.updated} skipped=${report.skipped} failed=${report.failed} unresolvedMedia=${report.unresolvedMedia.length}`,
    );
    console.log(`Report: ${path}`);
  }
}
