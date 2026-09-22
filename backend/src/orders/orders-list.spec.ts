import { OrdersService } from './orders.service';

/**
 * Unit tests for OrdersService.list() — pagination math, product filter,
 * and filter combinations.  All Mongo I/O is mocked via the model shim.
 */

/** Build a minimal service stub where list() can be exercised.
 *  Only model.find() / model.countDocuments() (and, for variant-filter
 *  tests, variantsCatalog.findById()) are called by list(). */
function serviceWithModel(docs: unknown[], count: number, variantsCatalog: unknown = {}) {
  const findChain = {
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(docs),
  };
  const model = {
    find: jest.fn().mockReturnValue(findChain),
    countDocuments: jest.fn().mockResolvedValue(count),
  };
  const service = new OrdersService(
    model as never, {} as never, {} as never, {} as never, {} as never,
    variantsCatalog as never, {} as never, {} as never, {} as never, {} as never,
    {} as never, {} as never, {} as never, {} as never, {} as never,
  );
  return { service, model, findChain };
}

// Minimal order doc shape the mapper needs (toOrderContract isn't tested here)
const mockDoc = {
  id: 'ord1', _id: { toString: () => 'ord1' },
  orderNumber: 1, status: 'en-attente', customer: {}, items: [],
  subtotalMinor: 0, shippingMinor: 0, discountMinor: 0, totalMinor: 0,
  manualSubtotalMinor: null, manualTotalMinor: null, currency: 'TND',
  coupon: null, deliveryCompany: '', carrier: {}, privateNote: '',
  exchange: false, attempts: 0, source: '', paymentMethod: 'cod',
  version: 0, confirmedAt: null, createdAt: new Date(), updatedAt: new Date(),
  statusHistory: [],
  save: jest.fn(),
};

describe('OrdersService.list() — pagination', () => {
  it('default page size is 100', async () => {
    const svc = serviceWithModel([mockDoc], 1);
    await svc.service.list({});
    expect(svc.findChain.limit).toHaveBeenCalledWith(100);
  });

  it('243 filtered results → 3 pages', async () => {
    const { service } = serviceWithModel([], 243);
    const result = await service.list({ perPage: 100 });
    expect(result.totalPages).toBe(3);
    expect(result.total).toBe(243);
  });

  it('7 filtered results → 1 page', async () => {
    const { service } = serviceWithModel([], 7);
    const result = await service.list({ perPage: 100 });
    expect(result.totalPages).toBe(1);
    expect(result.total).toBe(7);
  });

  it('0 results → 1 page (not 0)', async () => {
    const { service } = serviceWithModel([], 0);
    const result = await service.list({ perPage: 100 });
    expect(result.totalPages).toBe(1);
    expect(result.total).toBe(0);
  });

  it('returns page 2 with correct skip', async () => {
    const { service, findChain } = serviceWithModel([], 300);
    await service.list({ page: 2, perPage: 100 });
    expect(findChain.skip).toHaveBeenCalledWith(100); // (2-1)*100
  });

  it('clamps perPage to max 100', async () => {
    const { service, findChain } = serviceWithModel([], 5);
    await service.list({ perPage: 999 });
    expect(findChain.limit).toHaveBeenCalledWith(100);
  });
});

describe('OrdersService.list() — product filter', () => {
  it('adds items.productId filter when productId is supplied', async () => {
    const { service, model } = serviceWithModel([], 0);
    await service.list({ productId: 'prod-abc' });
    const filter = model.find.mock.calls[0][0];
    const andConds: Record<string, unknown>[] = filter.$and ?? [];
    const productCond = andConds.find((c) => c['items.productId'] !== undefined);
    expect(productCond).toEqual({ 'items.productId': 'prod-abc' });
  });

  it('does NOT add items.productId filter when productId is absent', async () => {
    const { service, model } = serviceWithModel([], 0);
    await service.list({ status: 'en-attente' });
    const filter = model.find.mock.calls[0][0];
    const body = JSON.stringify(filter);
    expect(body).not.toContain('items.productId');
  });

  it('product filter combined with status and date narrows the same filter object', async () => {
    const { service, model } = serviceWithModel([], 0);
    await service.list({
      productId: 'prod-xyz',
      status: 'confirme',
      after: '2026-01-01T00:00:00.000Z',
      before: '2026-01-31T23:59:59.999Z',
    });
    const filter = model.find.mock.calls[0][0];
    const and: Record<string, unknown>[] = filter.$and;
    expect(and.some((c) => c['items.productId'] === 'prod-xyz')).toBe(true);
    expect(and.some((c) => c.status === 'confirme')).toBe(true);
    // For 'confirme' status, the date filter uses { $or: [{ confirmedAt: ... }, { confirmedAt: null, createdAt: ... }] }
    // to handle orders that were confirmed before the confirmedAt field was backfilled.
    const dateClause = and.find((c) => Array.isArray((c as Record<string, unknown>).$or));
    expect(dateClause).toBeDefined();
  });

  it('filtered total is used for pagination — not a global total', async () => {
    // When the backend counts with the product filter in place,
    // paginate() uses that count for totalPages. Here we simulate 37 matches.
    const { service } = serviceWithModel([], 37);
    const result = await service.list({ productId: 'prod-abc', perPage: 100 });
    expect(result.total).toBe(37);
    expect(result.totalPages).toBe(1); // 37 <= 100 → 1 page
  });
});

describe('OrdersService.list() — product + variant filter', () => {
  it('a real variantId matches items.variantId OR a legacy item with the matching normalized variationKey', async () => {
    const variantsCatalog = { findById: jest.fn().mockResolvedValue({ productId: 'prod-djea', attributes: { size: 'XL', color: 'Noir' } }) };
    const { service, model } = serviceWithModel([], 0, variantsCatalog);
    await service.list({ productId: 'prod-djea', variantId: 'variant-xl-noir' });
    expect(variantsCatalog.findById).toHaveBeenCalledWith('variant-xl-noir');
    const filter = model.find.mock.calls[0][0];
    const and: Record<string, unknown>[] = filter.$and;
    const cond = and.find((c) => (c as Record<string, unknown>).items) as { items: { $elemMatch: Record<string, unknown> } };
    expect(cond).toBeDefined();
    expect(cond.items.$elemMatch.productId).toBe('prod-djea');
    expect(cond.items.$elemMatch.$or).toEqual([
      { variantId: 'variant-xl-noir' },
      { variantId: { $in: [null, undefined] }, variationKey: 'xl|noir' },
    ]);
  });

  it('a variant belonging to a different product matches nothing rather than falling back to "all variants"', async () => {
    const variantsCatalog = { findById: jest.fn().mockResolvedValue({ productId: 'prod-other', attributes: {} }) };
    const { service, model } = serviceWithModel([], 0, variantsCatalog);
    await service.list({ productId: 'prod-djea', variantId: 'wrong-product-variant' });
    const filter = model.find.mock.calls[0][0];
    const and: Record<string, unknown>[] = filter.$and;
    expect(and.some((c) => JSON.stringify(c) === JSON.stringify({ _id: { $in: [] } }))).toBe(true);
  });

  it('an unknown/deleted variantId matches nothing (never silently widens to the whole product)', async () => {
    const variantsCatalog = { findById: jest.fn().mockResolvedValue(null) };
    const { service, model } = serviceWithModel([], 0, variantsCatalog);
    await service.list({ productId: 'prod-djea', variantId: 'gone' });
    const filter = model.find.mock.calls[0][0];
    const and: Record<string, unknown>[] = filter.$and;
    expect(and.some((c) => JSON.stringify(c) === JSON.stringify({ _id: { $in: [] } }))).toBe(true);
  });

  it('variantId="none" matches items with no resolvable variant identity for that product', async () => {
    const { service, model } = serviceWithModel([], 0);
    await service.list({ productId: 'prod-casquette', variantId: 'none' });
    const filter = model.find.mock.calls[0][0];
    const and: Record<string, unknown>[] = filter.$and;
    const cond = and.find((c) => (c as Record<string, unknown>).items) as { items: { $elemMatch: Record<string, unknown> } };
    expect(cond.items.$elemMatch).toEqual({ productId: 'prod-casquette', variantId: { $in: [null, undefined] }, variationKey: null });
  });

  it('variantId="legacy:<key>" matches legacy orders directly by normalized key, without a catalog lookup', async () => {
    const variantsCatalog = { findById: jest.fn() };
    const { service, model } = serviceWithModel([], 0, variantsCatalog);
    await service.list({ productId: 'prod-djea', variantId: 'legacy:xl|noir' });
    expect(variantsCatalog.findById).not.toHaveBeenCalled();
    const filter = model.find.mock.calls[0][0];
    const and: Record<string, unknown>[] = filter.$and;
    const cond = and.find((c) => (c as Record<string, unknown>).items) as { items: { $elemMatch: Record<string, unknown> } };
    expect(cond.items.$elemMatch).toEqual({ productId: 'prod-djea', variantId: { $in: [null, undefined] }, variationKey: 'xl|noir' });
  });

  it('variantId without productId is ignored (no elemMatch, no crash)', async () => {
    const { service, model } = serviceWithModel([], 0);
    await service.list({ variantId: 'variant-xl-noir' });
    const filter = model.find.mock.calls[0][0];
    expect(filter).toEqual({});
  });
});

describe('OrdersService.list() — filter isolation', () => {
  it('status filter alone adds status condition', async () => {
    const { service, model } = serviceWithModel([], 0);
    await service.list({ status: 'annule' });
    const filter = model.find.mock.calls[0][0];
    const and: Record<string, unknown>[] = filter.$and;
    expect(and.some((c) => c.status === 'annule')).toBe(true);
  });

  it('multi-status CSV is converted to $in', async () => {
    const { service, model } = serviceWithModel([], 0);
    await service.list({ status: 'en-attente,confirme' });
    const filter = model.find.mock.calls[0][0];
    const and: Record<string, unknown>[] = filter.$and;
    const statusCond = and.find((c) => c.status !== undefined);
    expect((statusCond?.status as Record<string, unknown>).$in).toEqual(['en-attente', 'confirme']);
  });

  it('date filter is applied to createdAt for non-confirme status', async () => {
    const { service, model } = serviceWithModel([], 0);
    await service.list({ after: '2026-06-01T00:00:00.000Z' });
    const filter = model.find.mock.calls[0][0];
    const and: Record<string, unknown>[] = filter.$and;
    const dateClause = and.find((c) => c.createdAt !== undefined);
    expect(dateClause).toBeDefined();
    expect((dateClause?.createdAt as Record<string, Date>).$gte).toEqual(new Date('2026-06-01T00:00:00.000Z'));
  });

  it('confirme-only date filter uses confirmedAt with createdAt fallback', async () => {
    const { service, model } = serviceWithModel([], 0);
    await service.list({ status: 'confirme', after: '2026-06-01T00:00:00.000Z' });
    const filter = model.find.mock.calls[0][0];
    const and: Record<string, unknown>[] = filter.$and;
    const dateCond = and.find((c) => (c as Record<string, unknown>).$or);
    expect(dateCond).toBeDefined();
  });

  it('search filter adds $or with phone/name/number', async () => {
    const { service, model } = serviceWithModel([], 0);
    await service.list({ search: 'ahmed' });
    const filter = model.find.mock.calls[0][0];
    const and: Record<string, unknown>[] = filter.$and;
    const searchCond = and.find((c) => (c as Record<string, unknown>).$or);
    expect(searchCond).toBeDefined();
  });

  it('no filters → empty filter object (full collection scan)', async () => {
    const { service, model } = serviceWithModel([], 0);
    await service.list({});
    const filter = model.find.mock.calls[0][0];
    expect(filter).toEqual({});
  });
});

