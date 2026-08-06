import { parseOptionValues, serializeOptionValues, toProductContract } from './product.mapper';
import type { Product } from './product.schema';

function baseDoc(overrides: Partial<Product> = {}): Product & { id: string } {
  return {
    id: '507f1f77bcf86cd799439011',
    slug: 'robe-rouge',
    name: 'Robe rouge',
    status: 'published',
    description: 'desc',
    shortDescription: 'short',
    sku: null,
    regularPriceMinor: 120000,
    salePriceMinor: null,
    currency: 'TND',
    manageStock: true,
    stockQuantity: 5,
    images: [{ mediaId: null, url: 'http://x/a.jpg', alt: 'alt', position: 0 }],
    categoryIds: ['cat1'],
    categorySlugs: ['femme'],
    options: [{ label: 'Taille', type: 'select', values: ['S', 'M'] }],
    bundles: [],
    upsellIds: [],
    crossSellIds: [],
    costMinor: 50000,
    deliveryPriceMinor: 8000,
    deliveryCostMinor: 3000,
    menuOrder: 0,
    totalSales: 0,
    featured: false,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Product & { id: string };
}

describe('toProductContract', () => {
  it('uses the regular price and onSale=false when no sale price is set', () => {
    const p = toProductContract(baseDoc());
    expect(p.regularPrice).toBe(120);
    expect(p.salePrice).toBeNull();
    expect(p.onSale).toBe(false);
    expect(p.price).toBe(120);
  });

  it('uses the sale price as the effective price when set', () => {
    const p = toProductContract(baseDoc({ salePriceMinor: 89000 }));
    expect(p.onSale).toBe(true);
    expect(p.salePrice).toBe(89);
    expect(p.price).toBe(89);
    expect(p.regularPrice).toBe(120);
  });

  it('maps options to attributes with variation:true', () => {
    const p = toProductContract(baseDoc());
    expect(p.attributes).toEqual([{ name: 'Taille', options: ['S', 'M'], variation: true }]);
  });

  it('derives inStock from stockQuantity when manageStock is on', () => {
    expect(toProductContract(baseDoc({ stockQuantity: 0 })).inStock).toBe(false);
    expect(toProductContract(baseDoc({ stockQuantity: 3 })).inStock).toBe(true);
  });

  it('treats stock as unlimited (inStock=true) when manageStock is off', () => {
    const p = toProductContract(baseDoc({ manageStock: false, stockQuantity: null }));
    expect(p.inStock).toBe(true);
  });

  it('maps bundles with dinar prices', () => {
    const p = toProductContract(
      baseDoc({
        bundles: [
          {
            id: 'b1',
            name: 'Pack 2',
            label: null,
            regularPriceMinor: 200000,
            priceMinor: 180000,
            deliveryPriceMinor: 8000,
            quantity: 2,
            badgeColor: 'red',
            imageUrl: null,
            isDefault: true,
          },
        ],
      }),
    );
    expect(p.bundles).toEqual([
      {
        id: 'b1',
        name: 'Pack 2',
        label: undefined,
        regularPrice: 200,
        price: 180,
        deliveryPrice: 8,
        quantity: 2,
        badgeColor: 'red',
        imageUrl: undefined,
        isDefault: true,
      },
    ]);
  });

  it('carries cost/delivery figures in meta as dinars', () => {
    const p = toProductContract(baseDoc());
    expect(p.meta).toEqual({
      cost: 50,
      deliveryPrice: 8,
      deliveryCost: 3,
      _mzem_options: [{ label: 'Taille', type: 'select', values: ['S', 'M'] }],
    });
  });

  it('carries full-fidelity options (label+type+values) in meta._mzem_options for the admin editor — attributes above loses type entirely', () => {
    const p = toProductContract(baseDoc());
    expect(p.meta._mzem_options).toEqual([{ label: 'Taille', type: 'select', values: ['S', 'M'] }]);
  });
});

describe('option value round-trip', () => {
  it('parses a comma-separated string into a trimmed array', () => {
    expect(parseOptionValues('S, M ,L')).toEqual(['S', 'M', 'L']);
  });

  it('drops empty entries', () => {
    expect(parseOptionValues('S,,M,')).toEqual(['S', 'M']);
  });

  it('serializes back to a comma-separated string', () => {
    expect(serializeOptionValues(['S', 'M', 'L'])).toBe('S, M, L');
  });

  it('round-trips through parse then serialize', () => {
    const original = 'Rouge, Bleu, Vert';
    expect(serializeOptionValues(parseOptionValues(original))).toBe(original);
  });
});
