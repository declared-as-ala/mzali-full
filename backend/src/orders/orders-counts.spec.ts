import { OrdersService } from './orders.service';

/** counts() only touches this.model.aggregate() — every other constructor
 *  dependency is padded with {} as never, same pattern as pos-printer.spec.ts. */
function serviceWithAggregateResult(
  facets: Record<string, { n?: number; _id?: string; orderCount?: number }[]>,
) {
  const model = { aggregate: jest.fn().mockResolvedValue([facets]) };
  const service = new OrdersService(
    model as never, {} as never, {} as never, {} as never, {} as never,
    {} as never, {} as never, {} as never, {} as never, {} as never,
    {} as never, {} as never, {} as never, {} as never, {} as never,
  );
  return { service, model };
}

describe('OrdersService.counts', () => {
  it('sums the 5 attempt buckets into attempts.total and total', async () => {
    const { service } = serviceWithAggregateResult({
      pending: [{ n: 16 }],
      confirmed: [{ n: 480 }],
      attempt1: [{ n: 3 }],
      attempt2: [{ n: 2 }],
      attempt3: [{ n: 1 }],
      attempt4: [{ n: 1 }],
      attempt5: [{ n: 1 }],
      cancelled: [{ n: 20 }],
      abandoned: [{ n: 9 }],
      trash: [{ n: 4 }],
    });

    const result = await service.counts({});

    expect(result.attempts).toEqual({ total: 8, attempt1: 3, attempt2: 2, attempt3: 1, attempt4: 1, attempt5: 1 });
    // total = pending + confirmed + every attempt + cancelled — the "Normal"
    // tab total, matching the tab split already used elsewhere (abandoned/
    // trash are separate, intentionally-excluded buckets).
    expect(result.total).toBe(16 + 480 + 8 + 20);
    expect(result.pending).toBe(16);
    expect(result.confirmed).toBe(480);
    expect(result.cancelled).toBe(20);
    expect(result.abandoned).toBe(9);
    expect(result.trash).toBe(4);
  });

  it('treats a missing/empty facet bucket as zero rather than throwing', async () => {
    // $facet omits a bucket entirely from the result when nothing matches —
    // this must degrade to 0, not undefined/NaN propagating into totals.
    const { service } = serviceWithAggregateResult({ pending: [{ n: 5 }] });

    const result = await service.counts({});

    expect(result.confirmed).toBe(0);
    expect(result.attempts.total).toBe(0);
    expect(result.total).toBe(5);
  });

  it('scopes the $match stage to search and date range, not status', async () => {
    const { service, model } = serviceWithAggregateResult({});

    await service.counts({ search: '22334455', after: '2026-08-01T00:00:00.000Z', before: '2026-08-07T23:59:59.999Z' });

    const pipeline = model.aggregate.mock.calls[0][0];
    const facet = pipeline[0].$facet;
    const pendingMatch = facet.pending[0].$match;
    expect(pendingMatch.$and).toBeDefined();
    const dateClause = pendingMatch.$and.find((c: Record<string, { $gte?: Date; $lte?: Date }>) => c.createdAt);
    expect(dateClause.createdAt.$gte).toEqual(new Date('2026-08-01T00:00:00.000Z'));
    expect(dateClause.createdAt.$lte).toEqual(new Date('2026-08-07T23:59:59.999Z'));
  });

  it('scopes status count branches to items.productId when productId is specified', async () => {
    const { service, model } = serviceWithAggregateResult({});

    await service.counts({ productId: 'prod-123' });

    const pipeline = model.aggregate.mock.calls[0][0];
    const facet = pipeline[0].$facet;
    const pendingMatch = facet.pending[0].$match;
    expect(pendingMatch.$and).toBeDefined();
    const productClause = pendingMatch.$and.find((c: Record<string, unknown>) => c['items.productId'] === 'prod-123');
    expect(productClause).toBeDefined();
  });

  it('returns aggregated product order counts from the products facet branch', async () => {
    const { service } = serviceWithAggregateResult({
      pending: [{ n: 10 }],
      confirmed: [{ n: 20 }],
      products: [
        { _id: 'prod-dg', orderCount: 325 },
        { _id: 'prod-pull', orderCount: 181 },
      ],
    });

    const result = await service.counts({ status: 'en-attente' });

    expect(result.products).toEqual([
      { productId: 'prod-dg', orderCount: 325 },
      { productId: 'prod-pull', orderCount: 181 },
    ]);
  });

  it('scopes the products facet branch by selected status', async () => {
    const { service, model } = serviceWithAggregateResult({});

    await service.counts({ status: 'en-attente' });

    const pipeline = model.aggregate.mock.calls[0][0];
    const facet = pipeline[0].$facet;
    const productsBranch = facet.products;
    const matchStage = productsBranch[0].$match;
    expect(matchStage.$and).toBeDefined();
    const statusClause = matchStage.$and.find((c: Record<string, unknown>) => c.status === 'en-attente');
    expect(statusClause).toBeDefined();
  });
});
