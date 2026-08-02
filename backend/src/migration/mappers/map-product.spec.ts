import { mapWooProduct } from './map-product';
import type { WooProductRaw } from '../woo-types';

function baseRaw(overrides: Partial<WooProductRaw> = {}): WooProductRaw {
  return {
    id: 1,
    name: 'Robe Rouge',
    slug: 'robe-rouge',
    status: 'publish',
    description: 'desc',
    short_description: 'short',
    price: '89.900',
    regular_price: '120.000',
    sale_price: '89.900',
    on_sale: true,
    featured: false,
    menu_order: 5,
    total_sales: 12,
    stock_status: 'instock',
    stock_quantity: 4,
    images: [{ id: 1, src: 'http://x/a.jpg', alt: 'a' }],
    categories: [{ id: 7, name: 'Femme', slug: 'femme' }],
    attributes: [],
    upsell_ids: [2, 3],
    cross_sell_ids: [],
    meta_data: [],
    ...overrides,
  };
}

describe('mapWooProduct', () => {
  it('maps prices to millimes and preserves the effective status/sale/menu fields', () => {
    const m = mapWooProduct(baseRaw());
    expect(m.regularPriceMinor).toBe(120000);
    expect(m.salePriceMinor).toBe(89900);
    expect(m.status).toBe('published');
    expect(m.menuOrder).toBe(5);
    expect(m.totalSales).toBe(12);
    expect(m.categoryLegacyIds).toEqual(['7']);
    expect(m.upsellLegacyIds).toEqual(['2', '3']);
  });

  it('maps draft/private statuses correctly', () => {
    expect(mapWooProduct(baseRaw({ status: 'draft' })).status).toBe('draft');
    expect(mapWooProduct(baseRaw({ status: 'private' })).status).toBe('private');
  });

  it('extracts _mzem_bundles into millimes-priced bundle records', () => {
    const raw = baseRaw({
      meta_data: [
        {
          id: 1,
          key: '_mzem_bundles',
          value: [
            { name: 'Pack 2', regular_price: '200', price: '170', delivery_price: '8', quantity: 2, badge_color: 'red', default: true },
            { name: 'Pack 3', regular_price: '300', price: '240', delivery_price: '0', quantity: 3, badge_color: 'unknown-color' },
          ],
        },
      ],
    });
    const m = mapWooProduct(raw);
    expect(m.bundles).toHaveLength(2);
    expect(m.bundles[0]).toMatchObject({
      id: '0', name: 'Pack 2', regularPriceMinor: 200000, priceMinor: 170000,
      deliveryPriceMinor: 8000, quantity: 2, badgeColor: 'red', isDefault: true,
    });
    // invalid badge_color falls back to purple
    expect(m.bundles[1].badgeColor).toBe('purple');
    expect(m.bundles[1].isDefault).toBe(false);
  });

  it('prefers _mzem_options over native WC attributes when present', () => {
    const raw = baseRaw({
      attributes: [{ id: 1, name: 'Native', options: ['X', 'Y'], variation: true }],
      meta_data: [{ id: 2, key: '_mzem_options', value: [{ label: 'Taille', values: 'S, M, L' }] }],
    });
    const m = mapWooProduct(raw);
    expect(m.options).toEqual([{ label: 'Taille', type: 'select', values: ['S', 'M', 'L'] }]);
  });

  it('falls back to native WC variation attributes when no _mzem_options meta exists', () => {
    const raw = baseRaw({ attributes: [{ id: 1, name: 'Couleur', options: ['Rouge', 'Bleu'], variation: true }] });
    const m = mapWooProduct(raw);
    expect(m.options).toEqual([{ label: 'Couleur', type: 'select', values: ['Rouge', 'Bleu'] }]);
  });

  it('reads cost and delivery price/cost from their meta keys', () => {
    const raw = baseRaw({
      meta_data: [
        { id: 1, key: '_mzem_cost', value: '50' },
        { id: 2, key: '_mzem_delivery_price', value: '8' },
        { id: 3, key: '_mzem_delivery_cost', value: '3' },
      ],
    });
    const m = mapWooProduct(raw);
    expect(m.costMinor).toBe(50000);
    expect(m.deliveryPriceMinor).toBe(8000);
    expect(m.deliveryCostMinor).toBe(3000);
  });
});
