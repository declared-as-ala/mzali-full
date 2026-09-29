import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Product } from './product.schema';
import { Variant, VariantDocument } from './variant.schema';
import { combinationKey, validCombinationKeys } from './variant-options';

export type ReconcileChange = { id: string; sku: string; size: string; color: string };
export type ReconcileResult = { deactivated: ReconcileChange[]; reactivated: ReconcileChange[]; skipped?: string };

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
    const existing = await this.variants.findOne({ productId, boutiquePool: { $ne: true } });
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
      const already = await this.variants.exists({ productId: p.id, boutiquePool: { $ne: true } });
      if (already) { skipped += 1; continue; }
      if (!dryRun) await this.generateDefaultVariant(p.id);
      created += 1;
    }
    this.logger.log(`generateForAllProducts: created=${created} skipped=${skipped} total=${products.length}${dryRun ? ' (dry-run)' : ''}`);
    return { created, skipped, total: products.length };
  }

  /**
   * Makes the product's variants agree with its saved options (the source of
   * truth — see variant-options.ts). Idempotent; safe to run on every save.
   *
   *  - variant whose size/color is no longer an option value -> active=false +
   *    obsoleteByOptions=true. NEVER deleted or retired: orders, stock items
   *    and stock movements keep referencing it, and admins still see it (and
   *    any stock left on it) in the stock table.
   *  - variant previously switched off by this rule whose value is back in the
   *    options -> reactivated. A variant an admin turned off by hand is left
   *    alone (it does not carry obsoleteByOptions).
   *
   * Only touches MATRIX products, and only when two option axes can be
   * identified; otherwise nothing can be judged obsolete and it does nothing.
   */
  async reconcileWithOptions(productId: string, opts: { dryRun?: boolean } = {}): Promise<ReconcileResult> {
    const product = await this.products.findById(productId);
    if (!product || product.deletedAt) return { deactivated: [], reactivated: [], skipped: 'product not found' };
    if (product.inventoryModel !== 'MATRIX') return { deactivated: [], reactivated: [], skipped: 'not a MATRIX product' };
    const valid = validCombinationKeys((product.options ?? []).map((o) => ({ label: o.label, values: o.values ?? [] })));
    if (!valid) return { deactivated: [], reactivated: [], skipped: 'no size/color options' };

    const rows = await this.variants.find({ productId, retired: { $ne: true }, boutiquePool: { $ne: true } });
    const deactivated: ReconcileChange[] = [];
    const reactivated: ReconcileChange[] = [];
    for (const v of rows) {
      const size = v.attributes?.size; const color = v.attributes?.color;
      if (typeof size !== 'string' || typeof color !== 'string') continue; // not a size/color variant
      const change = { id: v.id, sku: v.sku, size, color };
      const isValid = valid.has(combinationKey(size, color));
      if (!isValid && v.active) deactivated.push(change);
      else if (isValid && !v.active && v.obsoleteByOptions) reactivated.push(change);
    }
    if (!opts.dryRun) {
      if (deactivated.length) {
        await this.variants.updateMany({ _id: { $in: deactivated.map((c) => c.id) } }, { $set: { active: false, obsoleteByOptions: true }, $inc: { inventoryRevision: 1 } });
      }
      if (reactivated.length) {
        await this.variants.updateMany({ _id: { $in: reactivated.map((c) => c.id) } }, { $set: { active: true, obsoleteByOptions: false }, $inc: { inventoryRevision: 1 } });
      }
    }
    if (deactivated.length || reactivated.length) {
      this.logger.log(`reconcileWithOptions ${productId}: deactivated=${deactivated.length} reactivated=${reactivated.length}${opts.dryRun ? ' (dry-run)' : ''}`);
    }
    return { deactivated, reactivated };
  }

  /** Purchase price (minor units) shown in the product editor: the first live variant's. */
  async purchasePriceMinorFor(productId: string): Promise<number | null> {
    const v = await this.variants.findOne({ productId, retired: { $ne: true }, boutiquePool: { $ne: true } }).sort({ createdAt: 1 });
    return v?.purchasePriceMinor ?? null;
  }

  /** Sets the purchase price on every live variant of THIS product (filter is always by productId). */
  async setPurchasePrice(productId: string, minor: number): Promise<void> {
    if (!productId) throw new Error('setPurchasePrice requires a productId');
    if (!(await this.variants.exists({ productId, retired: { $ne: true }, boutiquePool: { $ne: true } }))) await this.generateDefaultVariant(productId);
    await this.variants.updateMany({ productId, retired: { $ne: true }, boutiquePool: { $ne: true } }, { $set: { purchasePriceMinor: minor } });
  }

  /**
   * POS carts saved before the single-inventory change, and old POS sale lines, point at the archived
   * per-product "Boutique pool" variant (or a retired default one). Stock now lives on the product's
   * real variants, so map such an id to the product's single live variant when that is unambiguous
   * (a product without size/color variants). Returns null when it cannot be decided safely.
   */
  async resolveLiveVariant(variantId: string): Promise<VariantDocument | null> {
    const v = await this.findById(variantId);
    if (!v) return null;
    if (!v.boutiquePool && !v.retired) return v;
    const product = await this.products.findById(v.productId);
    if (!product || product.inventoryModel === 'MATRIX') return null;
    const live = await this.variants.find({ productId: v.productId, retired: { $ne: true }, boutiquePool: { $ne: true } });
    return live.length === 1 ? live[0] : null;
  }

  async allForProducts(productIds: string[]) {
    return this.variants.find({ productId: { $in: productIds }, retired: { $ne: true }, boutiquePool: { $ne: true } }).sort({ createdAt: 1 });
  }

  async resolveForSale(productId: string, variantId?: string | null) {
    const product = await this.products.findById(productId);
    if (!product || product.deletedAt) throw new BadRequestException('Produit introuvable');
    // Named after the product so the customer/admin knows exactly which
    // cart line to fix — this happens for real (not just in theory) when
    // an item was added to a cart/localStorage before that product became
    // variant-tracked, so the stale line has no variantId at all.
    if (!variantId && product.inventoryModel === 'MATRIX') throw new BadRequestException(`Sélectionnez une taille et une couleur pour « ${product.name} » avant de continuer.`);
    const variant = variantId ? await this.findById(variantId) : await this.generateDefaultVariant(productId);
    if (!variant || variant.productId !== productId || !variant.active || variant.retired || variant.boutiquePool) throw new BadRequestException(`« ${product.name} » : cette variante n'est plus disponible, sélectionnez-en une autre.`);
    return variant;
  }

  async findByProductId(productId: string): Promise<VariantDocument | null> {
    return this.variants.findOne({ productId, retired: { $ne: true }, boutiquePool: { $ne: true } });
  }

  /** Bulk lookup, keyed by productId — avoids N+1 queries in list views. */
  async findManyByProductIds(productIds: string[]): Promise<Map<string, VariantDocument>> {
    if (!productIds.length) return new Map();
    const docs = await this.variants.find({ productId: { $in: productIds }, retired: { $ne: true }, boutiquePool: { $ne: true } });
    return new Map(docs.map((d) => [d.productId, d]));
  }

  async findById(id: string): Promise<VariantDocument | null> {
    return this.variants.findById(id).catch(() => null);
  }

  async update(id: string, patch: Partial<Pick<Variant, 'sku' | 'barcode' | 'sellingPriceMinor' | 'compareAtPriceMinor' | 'active' | 'purchasePriceMinor' | 'lowStockThreshold'>>): Promise<VariantDocument | null> {
    const doc = await this.variants.findById(id);
    if (!doc) return null;
    if (doc.retired) throw new ConflictException('La variante historique reste archivée.');
    if (patch.sku !== undefined) {
      if (!patch.sku.trim()) throw new BadRequestException('SKU obligatoire');
      if (await this.variants.exists({ sku: patch.sku.trim(), _id: { $ne: id } })) throw new ConflictException('SKU déjà utilisé');
      doc.sku = patch.sku.trim();
    }
    if (patch.lowStockThreshold !== undefined) doc.lowStockThreshold = patch.lowStockThreshold;
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
