import { OrdersService } from './orders.service';

type Filter = { $and: Record<string, unknown>[] };

/** counts() uses one index-backed countDocuments() per status plus one (cached) product aggregation —
 *  every other constructor dependency is padded with {} as never, same pattern as pos-printer.spec.ts. */
function serviceWithCounts(byStatus: Record<string, number>, productRows: { _id?: string; orderCount?: number }[] = []) {
  const model = {
    countDocuments: jest.fn(async (filter: Filter) => byStatus[filter.$and[0].status as string] ?? 0),
    aggregate: jest.fn().mockResolvedValue(productRows),
  };
  const service = new OrdersService(
    model as never, {} as never, {} as never, {} as never, {} as never,
    {} as never, {} as never, {} as never, {} as never, {} as never,
    {} as never, {} as never, {} as never, {} as never, {} as never,
  );
  return { service, model };
}

const filterFor = (model: { countDocuments: jest.Mock }, status: string): Filter =>
  (model.countDocuments.mock.calls.map((c) => c[0] as Filter)).find((f) => f.$and[0].status === status)!;

describe('OrdersService.counts', () => {
  it('sums the 5 attempt buckets into attempts.total and total', async () => {
    const { service } = serviceWithCounts({
      'en-attente': 16, confirme: 480, 'tentative-1': 3, 'tentative-2': 2, 'tentative-3': 1, 'tentative-4': 1, 'tentative-5': 1,
      annule: 20, 'checkout-draft': 9, trash: 4,
    });

    const result = await service.counts({});

    expect(result.attempts).toEqual({ total: 8, attempt1: 3, attempt2: 2, attempt3: 1, attempt4: 1, attempt5: 1 });
    // total = pending + confirmed + every attempt + cancelled: the "Normal" tab total
    // (abandoned/trash are separate, intentionally-excluded buckets).
    expect(result.total).toBe(16 + 480 + 8 + 20);
    expect(result.pending).toBe(16);
    expect(result.confirmed).toBe(480);
    expect(result.cancelled).toBe(20);
    expect(result.abandoned).toBe(9);
    expect(result.trash).toBe(4);
  });

  it('a status with no orders counts as zero', async () => {
    const { service } = serviceWithCounts({ 'en-attente': 5 });

    const result = await service.counts({});

    expect(result.confirmed).toBe(0);
    expect(result.attempts.total).toBe(0);
    expect(result.total).toBe(5);
  });

  it('each status is its own count (no whole-collection $facet scan)', async () => {
    const { service, model } = serviceWithCounts({});

    await service.counts({});

    expect(model.countDocuments).toHaveBeenCalledTimes(11);
    const statuses = model.countDocuments.mock.calls.map((c) => (c[0] as Filter).$and[0].status).sort();
    expect(statuses).toEqual(['annule', 'checkout-draft', 'confirme', 'en-attente', 'retourne', 'tentative-1', 'tentative-2', 'tentative-3', 'tentative-4', 'tentative-5', 'trash'].sort());
  });

  it('scopes every status count to the search and date range', async () => {
    const { service, model } = serviceWithCounts({});

    await service.counts({ search: '22334455', after: '2026-08-01T00:00:00.000Z', before: '2026-08-07T23:59:59.999Z' });

    const pending = filterFor(model, 'en-attente');
    const dateClause = pending.$and.find((c) => c.createdAt) as { createdAt: { $gte: Date; $lte: Date } };
    expect(dateClause.createdAt.$gte).toEqual(new Date('2026-08-01T00:00:00.000Z'));
    expect(dateClause.createdAt.$lte).toEqual(new Date('2026-08-07T23:59:59.999Z'));
    const search = pending.$and.find((c) => c.$or && (c.$or as Record<string, unknown>[]).some((o) => 'customer.phone' in o));
    expect(search).toBeDefined();
  });

  it('scopes status counts to items.productId when productId is specified', async () => {
    const { service, model } = serviceWithCounts({});

    await service.counts({ productId: 'prod-123' });

    const productClause = filterFor(model, 'en-attente').$and.find((c) => c['items.productId'] === 'prod-123');
    expect(productClause).toBeDefined();
  });

  it('returns product order counts from the aggregation', async () => {
    const { service } = serviceWithCounts({ 'en-attente': 10 }, [
      { _id: 'prod-dg', orderCount: 325 },
      { _id: 'prod-pull', orderCount: 181 },
    ]);

    const result = await service.counts({ status: 'en-attente' });

    expect(result.products).toEqual([
      { productId: 'prod-dg', orderCount: 325 },
      { productId: 'prod-pull', orderCount: 181 },
    ]);
  });

  it('scopes the products breakdown by selected status', async () => {
    const { service, model } = serviceWithCounts({});

    await service.counts({ status: 'en-attente' });

    const matchStage = model.aggregate.mock.calls[0][0][0].$match as Filter;
    expect(matchStage.$and.find((c) => c.status === 'en-attente')).toBeDefined();
  });

  it('the heavy product breakdown is cached: a second identical call does not re-aggregate', async () => {
    const { service, model } = serviceWithCounts({}, [{ _id: 'p', orderCount: 1 }]);

    await service.counts({ status: 'confirme' });
    await service.counts({ status: 'confirme' });

    expect(model.aggregate).toHaveBeenCalledTimes(1);
    // ...while the cheap status counts stay live
    expect(model.countDocuments).toHaveBeenCalledTimes(22);
  });
});
