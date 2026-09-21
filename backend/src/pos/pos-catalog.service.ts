import { Injectable } from '@nestjs/common';
import type { PosCatalogItem, PosCatalogResponse } from '@contracts';
import { CategoriesService } from '@/catalog/categories.service';
import { LocationsService } from '@/catalog/locations.service';
import { ProductVariantsService } from '@/catalog/product-variants.service';
import { ProductsService } from '@/catalog/products.service';
import { primaryProductImage } from '@/catalog/product-media';
import { toMinor } from '@/common/money';
import { normalizePublicMediaUrl } from '@/common/public-media-url';
import { StockLedgerService } from '@/inventory/stock-ledger.service';
import { SettingsService } from '@/settings/settings.service';

/**
 * The full active catalog for the POS till, loaded once per session and
 * filtered/searched client-side (see docs/pos-platform/pos-architecture.md
 * §"Catalog loading" — the primary touch-first workflow needs zero-latency
 * category taps and search-as-you-type, not a round trip per keystroke).
 */
@Injectable()
export class PosCatalogService {
  constructor(
    private readonly products: ProductsService,
    private readonly categories: CategoriesService,
    private readonly variants: ProductVariantsService,
    private readonly locations: LocationsService,
    private readonly ledger: StockLedgerService,
    private readonly settings: SettingsService,
  ) {}

  async getCatalog(): Promise<PosCatalogResponse> {
    const [productList, categoryList, depotCode, posSettings] = await Promise.all([
      this.products.list({ perPage: 100, status: 'published' }, true),
      this.categories.list({ hideEmpty: true }),
      this.locations.getDefaultOnlineLocationCode(),
      this.settings.getRaw('pos'),
    ]);

    const products = [...productList.items];
    for (let page = 2; page <= productList.totalPages; page++) products.push(...(await this.products.list({ perPage: 100, page, status: 'published' }, true)).items);
    const productIds = products.map((p) => p.id);
    const allVariants = await this.variants.allForProducts(productIds);
    const variantIds = allVariants.map(v => v.id);

    const depotStock = await this.ledger.stockForVariants(variantIds, depotCode);
    const depotByVariant = new Map(depotStock.map(s => [s.variantId, s]));

    const favoriteProductIds = new Set<string>(
      (posSettings?.favoriteProductIds as string[] | undefined) ?? [],
    );

    const items: PosCatalogItem[] = [];
    for (const p of products) {
      const variant = await this.ledger.boutiqueVariant(p.id);
      const b = await this.ledger.boutiqueBalance(p.id);
      const depotAvailable = allVariants.filter(v => v.productId === p.id).reduce((sum,v) => { const item = depotByVariant.get(v.id); return sum + (item ? item.quantityOnHand - item.quantityReserved : 0); }, 0);
      items.push({
        productId: p.id,
        variantId: variant.id,
        name: p.name,
        slug: p.slug,
        sku: variant.sku,
        barcode: variant.barcode,
        priceMinor: variant.sellingPriceMinor ?? toMinor(p.price),
        size: variant.attributes.size ?? '',
        color: variant.attributes.color ?? '',
        stockTracked: p.inventoryEnabled !== false,
        imageUrl: normalizePublicMediaUrl(primaryProductImage(p.images)?.url ?? null),
        categoryIds: p.categoryIds,
        boutiqueAvailable: b.onHand - b.reserved,
        depotAvailable: depotAvailable,
        favorite: favoriteProductIds.has(p.id),
        bundles: p.bundles.map((bundle) => ({
          id: bundle.id,
          name: bundle.name,
          label: bundle.label ?? null,
          priceMinor: toMinor(bundle.price),
          regularPriceMinor: toMinor(bundle.regularPrice),
          quantity: bundle.quantity,
        })),
      });
    }

    return {
      items,
      categories: categoryList.map((c) => ({ id: c.id, name: c.name, slug: c.slug })),
      generatedAt: new Date().toISOString(),
    };
  }
}
