import { OrdersService } from './orders.service';

/**
 * Unit tests for OrdersService's private resolveUpdateItems() — the path
 * behind PUT /admin/orders/:id — focused on itemId stability (see
 * order.schema.ts's OrderItem.itemId doc): an existing line's id must be
 * preserved verbatim across a save, and a genuinely new line (no itemId
 * in the incoming patch) must be left undefined so the schema default
 * assigns a fresh one on save, never colliding with an existing id.
 */
function serviceWithCatalog(products: { _id: string; id: string; name: string; slug: string; images: unknown[]; salePriceMinor: number | null; regularPriceMinor: number; costMinor: number; categoryIds: string[] }[]) {
  const productsModel = { find: jest.fn().mockResolvedValue(products) };
  const inventory = {
    resolveSaleVariant: jest.fn().mockImplementation((productId: string, variantId?: string) =>
      Promise.resolve({ id: variantId ?? `${productId}-default-variant`, sellingPriceMinor: null, attributes: {} }),
    ),
  };
  const service = new OrdersService(
    {} as never, productsModel as never, {} as never, {} as never, {} as never,
    {} as never, {} as never, {} as never, {} as never, {} as never,
    {} as never, {} as never, {} as never, {} as never, {} as never,
  );
  Object.assign(service as unknown as Record<string, unknown>, { inventory });
  return { service };
}

const product = {
  _id: 'prod-1', id: 'prod-1', name: 'Ensemble Nike', slug: 'ensemble-nike',
  images: [], salePriceMinor: null, regularPriceMinor: 29000, costMinor: 0, categoryIds: [],
};

describe('OrdersService.resolveUpdateItems — itemId stability', () => {
  it('preserves an existing line\'s itemId verbatim', async () => {
    const { service } = serviceWithCatalog([product]);
    const resolveUpdateItems = (service as unknown as { resolveUpdateItems: (items: unknown[]) => Promise<{ itemId?: string }[]> }).resolveUpdateItems.bind(service);
    const result = await resolveUpdateItems([
      { itemId: 'existing-item-abc', productId: 'prod-1', variantId: 'prod-1-default-variant', qty: 2 },
    ]);
    expect(result[0].itemId).toBe('existing-item-abc');
  });

  it('leaves itemId undefined for a genuinely new line (no id in the patch)', async () => {
    const { service } = serviceWithCatalog([product]);
    const resolveUpdateItems = (service as unknown as { resolveUpdateItems: (items: unknown[]) => Promise<{ itemId?: string }[]> }).resolveUpdateItems.bind(service);
    const result = await resolveUpdateItems([
      { productId: 'prod-1', variantId: 'prod-1-default-variant', qty: 1 },
    ]);
    expect(result[0].itemId).toBeUndefined();
  });

  it('a mixed patch (one kept line, one new line) preserves and adds independently', async () => {
    const { service } = serviceWithCatalog([product]);
    const resolveUpdateItems = (service as unknown as { resolveUpdateItems: (items: unknown[]) => Promise<{ itemId?: string }[]> }).resolveUpdateItems.bind(service);
    const result = await resolveUpdateItems([
      { itemId: 'kept-line', productId: 'prod-1', variantId: 'prod-1-default-variant', qty: 2 },
      { productId: 'prod-1', variantId: 'prod-1-default-variant', qty: 1 },
    ]);
    expect(result[0].itemId).toBe('kept-line');
    expect(result[1].itemId).toBeUndefined();
  });
});
