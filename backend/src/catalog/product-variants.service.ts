import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Product } from './product.schema';
import { Variant, VariantDocument } from './variant.schema';

@Injectable()
export class ProductVariantsService {
  private readonly logger = new Logger(ProductVariantsService.name);

  constructor(
    @InjectModel(Product.name) private readonly products: Model<Product>,
    @InjectModel(Variant.name) private readonly variants: Model<Variant>,
  ) {}

  /**
   * Ensures exactly one Variant exists for `productId`. Idempotent — a
   * product that already has a variant is left untouched (never creates a
   * second one, never overwrites an admin-edited sku/barcode). See
   * docs/pos-platform/PLAN.md decision D7 for why this is 1:1 rather than
   * a cartesian product of the product's `options[]`.
   */
  async generateDefaultVariant(productId: string): Promise<VariantDocument> {
    const existing = await this.variants.findOne({ productId });
    if (existing) return existing;

    const product = await this.products.findById(productId);
    if (!product) throw new Error(`Product introuvable: ${productId}`);

    const sku = await this.resolveUniqueSku(product.sku, product.slug);
    return this.variants.create({
      productId,
      sku,
      barcode: null,
      attributes: {},
      active: product.status !== 'private',
      sellingPriceMinor: null,
      compareAtPriceMinor: null,
      lastPurchaseCostMinor: null,
      averageCostMinor: null,
    });
  }

  /** Runs `generateDefaultVariant` for every product, idempotent, safe to re-run. */
  async generateForAllProducts(dryRun = false): Promise<{ created: number; skipped: number; total: number }> {
    const products = await this.products.find().select({ _id: 1 });
    let created = 0;
    let skipped = 0;
    for (const p of products) {
      const already = await this.variants.exists({ productId: p.id });
      if (already) { skipped += 1; continue; }
      if (!dryRun) await this.generateDefaultVariant(p.id);
      created += 1;
    }
    this.logger.log(`generateForAllProducts: created=${created} skipped=${skipped} total=${products.length}${dryRun ? ' (dry-run)' : ''}`);
    return { created, skipped, total: products.length };
  }

  async findByProductId(productId: string): Promise<VariantDocument | null> {
    return this.variants.findOne({ productId });
  }

  /** Bulk lookup, keyed by productId — avoids N+1 queries in list views. */
  async findManyByProductIds(productIds: string[]): Promise<Map<string, VariantDocument>> {
    if (!productIds.length) return new Map();
    const docs = await this.variants.find({ productId: { $in: productIds } });
    return new Map(docs.map((d) => [d.productId, d]));
  }

  async findById(id: string): Promise<VariantDocument | null> {
    return this.variants.findById(id).catch(() => null);
  }

  async update(id: string, patch: Partial<Pick<Variant, 'sku' | 'barcode' | 'sellingPriceMinor' | 'compareAtPriceMinor' | 'active' | 'purchasePriceMinor'>>): Promise<VariantDocument | null> {
    const doc = await this.variants.findById(id);
    if (!doc) return null;
    if (patch.sku !== undefined && patch.sku.trim()) doc.sku = patch.sku.trim();
    if (patch.barcode !== undefined) doc.barcode = patch.barcode?.trim() || null;
    if (patch.sellingPriceMinor !== undefined) doc.sellingPriceMinor = patch.sellingPriceMinor;
    if (patch.compareAtPriceMinor !== undefined) doc.compareAtPriceMinor = patch.compareAtPriceMinor;
    if (patch.active !== undefined) doc.active = patch.active;
    if (patch.purchasePriceMinor !== undefined) doc.purchasePriceMinor = patch.purchasePriceMinor;
    await doc.save();
    return doc;
  }

  /** Prefer the product's own SKU; fall back to its slug; disambiguate on collision. */
  private async resolveUniqueSku(productSku: string | null, productSlug: string): Promise<string> {
    const candidates = [productSku?.trim(), productSlug].filter((v): v is string => Boolean(v));
    for (const candidate of candidates) {
      const clash = await this.variants.exists({ sku: candidate });
      if (!clash) return candidate;
    }
    // Last resort: slug is guaranteed unique on Product, but guard anyway.
    return `${productSlug}-${Date.now().toString(36)}`;
  }
}
