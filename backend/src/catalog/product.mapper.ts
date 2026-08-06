import type { Product as ProductContract } from '@contracts';
import { toDinars } from '@/common/money';
import { normalizePublicMediaUrl } from '@/common/public-media-url';
import { Product as ProductSchema } from './product.schema';

/**
 * Maps a stored product document to the exact `types/product.ts` contract
 * the storefront consumes. Semantics mirror `services/woo/woo-mappers.ts`:
 * price = effective price (sale if present, else regular); onSale reflects
 * whether a sale price is set; options are exposed as `attributes` with
 * variation:true (matching the mzem-options path in the legacy mapper).
 */
export function toProductContract(doc: ProductSchema & { id?: string; _id?: unknown }): ProductContract {
  const regularPrice = toDinars(doc.regularPriceMinor);
  const salePrice = doc.salePriceMinor !== null && doc.salePriceMinor !== undefined
    ? toDinars(doc.salePriceMinor)
    : null;
  const onSale = salePrice !== null;
  const price = onSale ? (salePrice as number) : regularPrice;

  return {
    id: String(doc.id ?? doc._id),
    slug: doc.slug,
    name: doc.name,
    status: doc.status,
    description: doc.description ?? '',
    shortDescription: doc.shortDescription ?? '',
    price,
    regularPrice,
    salePrice,
    onSale,
    currency: doc.currency ?? 'TND',
    inStock: doc.manageStock ? (doc.stockQuantity ?? 0) > 0 : true,
    stockQuantity: doc.stockQuantity ?? null,
    images: (doc.images ?? []).map((img) => ({
      id: img.mediaId ?? img.url,
      url: normalizePublicMediaUrl(img.url),
      alt: img.alt || undefined,
    })),
    categoryIds: doc.categoryIds ?? [],
    categorySlugs: doc.categorySlugs ?? [],
    attributes: (doc.options ?? []).map((o) => ({
      name: o.label,
      options: o.values ?? [],
      variation: true,
    })),
    bundles: (doc.bundles ?? []).map((b) => ({
      id: b.id,
      name: b.name,
      label: b.label ?? undefined,
      regularPrice: toDinars(b.regularPriceMinor),
      price: toDinars(b.priceMinor),
      deliveryPrice: toDinars(b.deliveryPriceMinor),
      quantity: b.quantity,
      badgeColor: b.badgeColor,
      imageUrl: b.imageUrl ? normalizePublicMediaUrl(b.imageUrl) : undefined,
      isDefault: b.isDefault,
    })),
    upsellIds: doc.upsellIds ?? [],
    crossSellIds: doc.crossSellIds ?? [],
    supplierId: doc.supplierId ?? null,
    posOnly: doc.posOnly ?? false,
    meta: {
      cost: toDinars(doc.costMinor ?? 0),
      deliveryPrice: toDinars(doc.deliveryPriceMinor ?? 0),
      deliveryCost: toDinars(doc.deliveryCostMinor ?? 0),
      // Full-fidelity options (label + type + values) for the admin editor
      // to read back — `attributes` above is the lossy WooCommerce-shaped
      // view for the storefront (renames label->name, drops type entirely),
      // which is why options saved correctly and showed on the public
      // product page but came back empty when reopening the admin editor.
      _mzem_options: (doc.options ?? []).map((o) => ({ label: o.label, type: o.type, values: o.values ?? [] })),
    },
  };
}

/** Parses the frontend's comma-separated options string into an array. */
export function parseOptionValues(values: string | string[]): string[] {
  if (Array.isArray(values)) return values.map((v) => v.trim()).filter(Boolean);
  return values.split(',').map((v) => v.trim()).filter(Boolean);
}

/** Serializes stored option values back to the frontend's comma-separated form. */
export function serializeOptionValues(values: string[]): string {
  return values.join(', ');
}
