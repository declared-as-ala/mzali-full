import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Product } from '@/catalog/product.schema';
import { ProductsService } from '@/catalog/products.service';
import { primaryProductImage } from '@/catalog/product-media';
import { ProductVariantsService } from '@/catalog/product-variants.service';
import { normalizePublicMediaUrl } from '@/common/public-media-url';
import { resolveDateRange } from './dto/pos-analytics.dto';
import { PosAnalyticsService } from './pos-analytics.service';
import { PosSale } from './pos-sale.schema';

export type PosSuggestion = {
  productId: string;
  variantId: string;
  name: string;
  imageUrl: string | null;
  priceMinor: number;
  reason: 'frequently_bought_together' | 'best_seller' | 'similar';
};

const CO_OCCURRENCE_WINDOW_DAYS = 90;

/**
 * Real, data-driven checkout suggestions — never labeled "AI" (no ML model
 * is involved). Three tiers, each backed by actual completed-sale data:
 * "frequently bought together" is a genuine co-occurrence count over
 * pos_sales, "best sellers" reuses PosAnalyticsService.topProducts(),
 * "similar" reuses ProductsService.getRelated() (upsell/cross-sell or
 * same-category — the exact logic the storefront's own related-products
 * rail already uses, not a second implementation of it).
 */
@Injectable()
export class PosSuggestionsService {
  constructor(
    @InjectModel(PosSale.name) private readonly sales: Model<PosSale>,
    @InjectModel(Product.name) private readonly products: Model<Product>,
    private readonly variants: ProductVariantsService,
    private readonly productsService: ProductsService,
    private readonly analytics: PosAnalyticsService,
  ) {}

  async forVariant(variantId: string, locationId: string): Promise<{
    frequentlyBoughtTogether: PosSuggestion[];
    bestSellers: PosSuggestion[];
    similar: PosSuggestion[];
  }> {
    const variant = await this.variants.findById(variantId);
    const productId = variant?.productId ?? null;

    const [coOccurrenceRows, bestSellerRows, relatedRows] = await Promise.all([
      this.coOccurrence(variantId),
      this.analytics.topProducts(
        { ...resolveDateRange('last30'), locationId },
        { channel: 'pos', limit: 8 },
      ),
      productId ? this.productsService.getRelated(productId, 6) : Promise.resolve([]),
    ]);

    const excludeVariantIds = new Set([variantId, ...coOccurrenceRows.map((r) => r.variantId)]);

    const bestSellers = await this.toSuggestions(
      bestSellerRows
        .filter((r) => r.variantId && !excludeVariantIds.has(r.variantId))
        .slice(0, 6)
        .map((r) => r.variantId as string),
      'best_seller',
    );

    const relatedVariantByProduct = await this.variants.findManyByProductIds(relatedRows.map((p) => p.id));
    const similar = await this.toSuggestions(
      relatedRows
        .map((p) => relatedVariantByProduct.get(p.id)?.id)
        .filter((v): v is string => Boolean(v) && !excludeVariantIds.has(v)),
      'similar',
    );

    return {
      frequentlyBoughtTogether: await this.toSuggestions(coOccurrenceRows.map((r) => r.variantId), 'frequently_bought_together'),
      bestSellers,
      similar,
    };
  }

  private async coOccurrence(variantId: string): Promise<{ variantId: string; count: number }[]> {
    const since = new Date(Date.now() - CO_OCCURRENCE_WINDOW_DAYS * 86_400_000);
    const rows = await this.sales.aggregate<{ _id: string; count: number }>([
      { $match: { status: 'COMPLETED', createdAt: { $gte: since }, 'lines.variantId': variantId } },
      { $unwind: '$lines' },
      { $match: { 'lines.variantId': { $ne: variantId } } },
      { $group: { _id: '$lines.variantId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 6 },
    ]);
    return rows.map((r) => ({ variantId: r._id, count: r.count }));
  }

  private async toSuggestions(variantIds: string[], reason: PosSuggestion['reason']): Promise<PosSuggestion[]> {
    if (!variantIds.length) return [];
    const variantDocs = await Promise.all(variantIds.map((id) => this.variants.findById(id)));
    const validVariants = variantDocs.filter((v): v is NonNullable<typeof v> => Boolean(v));
    const productIds = [...new Set(validVariants.map((v) => v.productId))];
    const productDocs = await this.products.find({ _id: { $in: productIds } }).select({ name: 1, images: 1, regularPriceMinor: 1, salePriceMinor: 1 });
    const productById = new Map(productDocs.map((p) => [p.id, p]));

    const rows: (PosSuggestion | null)[] = validVariants.map((v) => {
      const product = productById.get(v.productId);
      if (!product) return null;
      return {
        productId: v.productId,
        variantId: v.id,
        name: product.name,
        imageUrl: normalizePublicMediaUrl(primaryProductImage(product.images)?.url ?? null),
        priceMinor: v.sellingPriceMinor ?? product.salePriceMinor ?? product.regularPriceMinor,
        reason,
      };
    });
    return rows.filter((s): s is PosSuggestion => s !== null);
  }
}
