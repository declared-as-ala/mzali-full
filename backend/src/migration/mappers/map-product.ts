import { parseToMinor } from '@/common/money';
import type { WooMetaEntry, WooProductRaw } from '../woo-types';

export type MappedBundle = {
  id: string;
  name: string;
  label: string | null;
  regularPriceMinor: number;
  priceMinor: number;
  deliveryPriceMinor: number;
  quantity: number;
  badgeColor: 'red' | 'green' | 'blue' | 'purple';
  imageUrl: string | null;
  isDefault: boolean;
};

export type MappedOption = { label: string; type: 'text' | 'select' | 'radio'; values: string[] };

export type MappedProduct = {
  legacyId: string;
  name: string;
  slug: string;
  status: 'published' | 'draft' | 'private';
  description: string;
  shortDescription: string;
  regularPriceMinor: number;
  salePriceMinor: number | null;
  manageStock: boolean;
  stockQuantity: number | null;
  categoryLegacyIds: string[];
  imageUrls: string[];
  options: MappedOption[];
  bundles: MappedBundle[];
  upsellLegacyIds: string[];
  crossSellLegacyIds: string[];
  costMinor: number;
  deliveryPriceMinor: number;
  deliveryCostMinor: number;
  menuOrder: number;
  totalSales: number;
  featured: boolean;
};

function findMeta(meta: WooMetaEntry[], key: string): unknown {
  return meta.find((m) => m.key === key)?.value;
}

/** Ported from services/woo/woo-mappers.ts:extractBundles, producing minor-unit prices. */
function extractBundles(meta: WooMetaEntry[]): MappedBundle[] {
  const raw = findMeta(meta, '_mzem_bundles');
  if (!Array.isArray(raw)) return [];
  const validColors = ['red', 'green', 'blue', 'purple'];
  return raw.map((b: Record<string, unknown>, i: number) => ({
    id: String(i),
    name: String(b.name ?? ''),
    label: b.label ? String(b.label) : null,
    regularPriceMinor: parseToMinor(b.regular_price as string | number | undefined),
    priceMinor: parseToMinor(b.price as string | number | undefined),
    deliveryPriceMinor: parseToMinor(b.delivery_price as string | number | undefined),
    quantity: Number(b.quantity ?? 1) || 1,
    badgeColor: (validColors.includes(String(b.badge_color)) ? b.badge_color : 'purple') as MappedBundle['badgeColor'],
    imageUrl: b.image_url ? String(b.image_url) : null,
    isDefault: Boolean(b.default),
  }));
}

/** Ported from services/woo/woo-mappers.ts:extractMzemOptions. */
function extractMzemOptions(meta: WooMetaEntry[]): MappedOption[] {
  const raw = findMeta(meta, '_mzem_options');
  if (!Array.isArray(raw)) return [];
  return (raw as { label?: string; values?: string | string[] }[])
    .filter((o) => o && o.label)
    .map((o) => ({
      label: o.label as string,
      type: 'select' as const,
      values: Array.isArray(o.values)
        ? o.values.map(String).map((s) => s.trim()).filter(Boolean)
        : String(o.values ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    }));
}

export function mapWooProduct(raw: WooProductRaw): MappedProduct {
  const meta = raw.meta_data ?? [];
  const mzemOptions = extractMzemOptions(meta);
  const nativeOptions: MappedOption[] = (raw.attributes ?? [])
    .filter((a) => a.variation)
    .map((a) => ({ label: a.name, type: 'select' as const, values: a.options ?? [] }));

  return {
    legacyId: String(raw.id),
    name: raw.name,
    slug: raw.slug,
    status: raw.status === 'publish' ? 'published' : raw.status === 'private' ? 'private' : 'draft',
    description: raw.description ?? '',
    shortDescription: raw.short_description ?? '',
    regularPriceMinor: parseToMinor(raw.regular_price || raw.price),
    salePriceMinor: raw.sale_price ? parseToMinor(raw.sale_price) : null,
    manageStock: true,
    stockQuantity: raw.stock_quantity,
    categoryLegacyIds: (raw.categories ?? []).map((c) => String(c.id)),
    imageUrls: (raw.images ?? []).map((img) => img.src),
    options: mzemOptions.length > 0 ? mzemOptions : nativeOptions,
    bundles: extractBundles(meta),
    upsellLegacyIds: (raw.upsell_ids ?? []).map(String),
    crossSellLegacyIds: (raw.cross_sell_ids ?? []).map(String),
    costMinor: parseToMinor(findMeta(meta, '_mzem_cost') as string | number | undefined),
    deliveryPriceMinor: parseToMinor(findMeta(meta, '_mzem_delivery_price') as string | number | undefined),
    deliveryCostMinor: parseToMinor(findMeta(meta, '_mzem_delivery_cost') as string | number | undefined),
    menuOrder: raw.menu_order ?? 0,
    totalSales: raw.total_sales ?? 0,
    featured: Boolean(raw.featured),
  };
}
