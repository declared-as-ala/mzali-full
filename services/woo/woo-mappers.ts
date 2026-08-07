import type { Category, Product, ProductBundle, OrderResponse, OrderStatus } from '@/types';
import type { WooCategoryRaw, WooOrderRaw, WooProductRaw } from './woo-types';

const CURRENCY = process.env.NEXT_PUBLIC_CURRENCY_CODE ?? 'TND';

function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

export function mapCategory(c: WooCategoryRaw): Category {
  return {
    id: String(c.id),
    parentId: c.parent ? String(c.parent) : null,
    name: c.name,
    slug: c.slug,
    description: c.description || undefined,
    imageUrl: c.image?.src,
    productCount: c.count,
  };
}

function extractBundles(meta: WooProductRaw['meta_data']): ProductBundle[] {
  const raw = meta.find((m) => m.key === '_mzem_bundles')?.value;
  if (!Array.isArray(raw)) return [];
  return raw.map((b: any, i: number) => ({
    id: String(i),
    name: String(b.name ?? ''),
    label: b.label ? String(b.label) : undefined,
    regularPrice: num(b.regular_price),
    price: num(b.price),
    deliveryPrice: num(b.delivery_price),
    quantity: Number(b.quantity ?? 1) || 1,
    badgeColor: (['red', 'green', 'blue', 'purple'].includes(b.badge_color) ? b.badge_color : 'purple') as ProductBundle['badgeColor'],
    imageUrl: b.image_url || undefined,
    isDefault: !!b.default,
  }));
}

type StoredOption = { label: string; type?: string; values: string | string[] };

function extractMzemOptions(meta: WooProductRaw['meta_data']): { name: string; options: string[]; variation: boolean }[] {
  const raw = meta.find((m) => m.key === '_mzem_options')?.value;
  if (!Array.isArray(raw)) return [];
  return (raw as StoredOption[])
    .filter((o) => o && o.label)
    .map((o) => ({
      name: o.label,
      options: Array.isArray(o.values)
        ? o.values.map(String).map((s) => s.trim()).filter(Boolean)
        : String(o.values ?? '').split(',').map((s) => s.trim()).filter(Boolean),
      variation: true,
    }));
}

export function mapProduct(p: WooProductRaw): Product {
  const meta: Record<string, unknown> = {};
  for (const m of p.meta_data ?? []) meta[m.key] = m.value;

  // PREFER _mzem_options (set by Mzali admin) over native WC attributes.
  // Fall back to WC attributes when the product was never edited in the new admin.
  const mzem = extractMzemOptions(p.meta_data ?? []);
  const native = (p.attributes ?? []).map((a) => ({ name: a.name, options: a.options, variation: a.variation }));
  const attributes = mzem.length > 0 ? mzem : native;

  return {
    id: String(p.id),
    slug: p.slug,
    name: p.name,
    status: p.status === 'publish' ? 'published' : p.status === 'private' ? 'private' : 'draft',
    description: p.description ?? '',
    shortDescription: p.short_description ?? '',
    price: num(p.price),
    regularPrice: num(p.regular_price || p.price),
    salePrice: p.sale_price ? num(p.sale_price) : null,
    onSale: !!p.on_sale,
    currency: CURRENCY,
    inStock: p.stock_status === 'instock',
    stockQuantity: p.stock_quantity,
    images: (p.images ?? []).map((img, position) => ({ id: String(img.id), url: img.src, alt: img.alt, position, isPrimary: position === 0 })),
    categoryIds: (p.categories ?? []).map((c) => String(c.id)),
    categorySlugs: (p.categories ?? []).map((c) => c.slug),
    attributes,
    bundles: extractBundles(p.meta_data ?? []),
    upsellIds: (p.upsell_ids ?? []).map(String),
    crossSellIds: (p.cross_sell_ids ?? []).map(String),
    supplierId: null,
    meta,
    posOnly: false, // WooCommerce provider has no concept of a POS-only product
  };
}

export function mapOrder(o: WooOrderRaw): OrderResponse {
  const activeShipping = (o.shipping_lines ?? []).filter((l) => num(l.total) > 0);
  const shippingTotal = activeShipping.length > 0 ? num(activeShipping[0].total) : 0;
  // Pass the raw slug through — admin UI shows it as-is so custom-status plugins work.
  const status = (o.status ?? 'pending') as OrderStatus;
  // Fallback: if WC stored total = 0 (legacy orders) reconstruct from line totals.
  const metaMap: Record<string, unknown> = {};
  for (const m of o.meta_data ?? []) metaMap[m.key] = m.value;
  let total = num(o.total);
  const manualTotal = metaMap._mzem_manual_total;
  const manualTotalNumber = numberish(manualTotal);
  if (manualTotalNumber !== null) {
    total = manualTotalNumber;
  } else if (total <= 0) {
    total = (o.line_items ?? []).reduce(
      (s, li) => s + (num(li.total) || num(li.price) * li.quantity),
      0,
    ) + shippingTotal;
  }
  return {
    id: String(o.id),
    number: o.number,
    status,
    currency: o.currency || CURRENCY,
    total,
    createdAt: o.date_created,
    customer: {
      firstName: o.billing.first_name,
      lastName: o.billing.last_name,
      phone: o.billing.phone,
      email: o.billing.email,
      city: o.billing.city,
      address: o.billing.address_1,
    },
    items: (o.line_items ?? []).map((li) => ({
      productId: String(li.product_id),
      name: li.name,
      quantity: li.quantity,
      price: num(li.price),
      total: num(li.total),
      imageUrl: li.image?.src,
      attributes: (li.meta_data ?? [])
        .filter((m) => !String(m.key ?? '').startsWith('_'))
        .map((m) => ({
          key: String(m.display_key ?? m.key ?? ''),
          value: typeof m.value === 'string' ? m.value : String(m.display_value ?? JSON.stringify(m.value ?? '')),
        }))
        .filter((m) => m.key && m.value && m.value !== '—'),
    })),
    shipping: shippingTotal,
    meta: Object.fromEntries((o.meta_data ?? []).map((m) => [m.key, m.value])),
  };
}

function numberish(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
