import { OrdersService } from './orders.service';

type MockDoc = {
  _id: string;
  orderNumber: number;
  status: string;
  createdAt: Date;
  confirmedAt?: Date;
  customer?: { firstName: string; phone: string };
  carrier?: Record<string, unknown>;
  items?: unknown[];
  [key: string]: unknown;
};

type FilterClause = {
  status?: string;
  $or?: Array<{
    confirmedAt?: { $gte?: string; $lte?: string };
    createdAt?: { $gte?: string; $lte?: string };
    [key: string]: unknown;
  }>;
};

function mockOrdersModel(docs: MockDoc[]) {
  const model = {
    find: jest.fn().mockImplementation((filter: { $and?: FilterClause[] }) => {
      let filtered = [...docs];
      if (filter?.$and) {
        for (const cond of filter.$and) {
          if (cond.status) {
            filtered = filtered.filter((d) => d.status === cond.status);
          }
          if (cond.$or) {
            filtered = filtered.filter((d) => {
              return cond.$or?.some((clause) => {
                if (clause.confirmedAt) {
                  const val = d.confirmedAt ? new Date(d.confirmedAt).getTime() : null;
                  const gte = clause.confirmedAt.$gte ? new Date(clause.confirmedAt.$gte).getTime() : -Infinity;
                  const lte = clause.confirmedAt.$lte ? new Date(clause.confirmedAt.$lte).getTime() : Infinity;
                  return val !== null && val >= gte && val <= lte;
                }
                if (clause.createdAt) {
                  const val = new Date(d.createdAt).getTime();
                  const gte = clause.createdAt.$gte ? new Date(clause.createdAt.$gte).getTime() : -Infinity;
                  const lte = clause.createdAt.$lte ? new Date(clause.createdAt.$lte).getTime() : Infinity;
                  return val >= gte && val <= lte;
                }
                return false;
              });
            });
          }
        }
      }

      return {
        sort: jest.fn().mockImplementation((sortObj: Record<string, number>) => {
          const key = sortObj.confirmedAt !== undefined ? 'confirmedAt' : 'createdAt';
          const dir = sortObj[key];
          filtered.sort((a, b) => {
            const valA = a[key] ? new Date(a[key] as Date).getTime() : 0;
            const valB = b[key] ? new Date(b[key] as Date).getTime() : 0;
            return dir === 1 ? valA - valB : valB - valA;
          });
          return {
            skip: jest.fn().mockImplementation((skipNum: number) => {
              const skipped = filtered.slice(skipNum);
              return {
                limit: jest.fn().mockImplementation((limitNum: number) => {
                  return Promise.resolve(skipped.slice(0, limitNum));
                }),
              };
            }),
          };
        }),
      };
    }),
    countDocuments: jest.fn().mockResolvedValue(docs.length),
    aggregate: jest.fn().mockResolvedValue([{
      pending: [{ n: 0 }],
      confirmed: [{ n: docs.filter((d) => d.status === 'confirme').length }],
      attempt1: [{ n: 0 }], attempt2: [{ n: 0 }], attempt3: [{ n: 0 }], attempt4: [{ n: 0 }], attempt5: [{ n: 0 }],
      cancelled: [{ n: 0 }], abandoned: [{ n: 0 }], trash: [{ n: 0 }],
    }]),
  };

  const service = new OrdersService(
    model as never, {} as never, {} as never, {} as never, {} as never,
    {} as never, {} as never, {} as never, {} as never, {} as never,
    {} as never, {} as never, {} as never, {} as never,
  );

  return { service, model };
}

describe('OrdersService - confirmedAt sorting and filtering', () => {
  const docA: MockDoc = {
    _id: 'order-a',
    orderNumber: 101,
    status: 'confirme',
    createdAt: new Date('2026-08-10T10:00:00Z'),
    confirmedAt: new Date('2026-08-14T12:00:00Z'),
    customer: { firstName: 'Alice', phone: '123' },
    carrier: {},
    items: [],
  };

  const docB: MockDoc = {
    _id: 'order-b',
    orderNumber: 102,
    status: 'confirme',
    createdAt: new Date('2026-08-12T10:00:00Z'),
    confirmedAt: new Date('2026-08-14T10:00:00Z'),
    customer: { firstName: 'Bob', phone: '456' },
    carrier: {},
    items: [],
  };

  it('sorts confirmed orders by confirmedAt DESC by default', async () => {
    const { service, model } = mockOrdersModel([docB, docA]);

    const result = await service.list({ status: 'confirme' });

    expect(model.find).toHaveBeenCalled();
    expect(result.items[0].id).toBe('order-a'); // Confirmed at 12:00 comes before 10:00
    expect(result.items[1].id).toBe('order-b');
  });

  it('sorts confirmed orders by confirmedAt ASC when sortOrder=asc', async () => {
    const { service } = mockOrdersModel([docA, docB]);

    const result = await service.list({ status: 'confirme', sortOrder: 'asc' });

    expect(result.items[0].id).toBe('order-b'); // Confirmed at 10:00 comes before 12:00 in ASC
    expect(result.items[1].id).toBe('order-a');
  });

  it('sorts two orders created in different order but confirmed in reverse order', async () => {
    // docA created 10/08, confirmed 14/08 12:00
    // docB created 12/08, confirmed 14/08 10:00
    const { service } = mockOrdersModel([docB, docA]);

    const result = await service.list({ status: 'confirme', sortOrder: 'desc' });

    // Even though docB was created AFTER docA, docA was confirmed AFTER docB, so docA comes first
    expect(result.items[0].id).toBe('order-a');
    expect(result.items[1].id).toBe('order-b');
  });

  it('filters by confirmedAt when status=confirme and date preset (Aujourd-hui) is applied', async () => {
    const { service, model } = mockOrdersModel([docA]);

    await service.list({
      status: 'confirme',
      after: '2026-08-14T00:00:00.000Z',
      before: '2026-08-14T23:59:59.999Z',
    });

    const pipeline = model.find.mock.calls[0][0] as { $and: Array<{ $or?: Array<{ confirmedAt?: { $gte?: Date } }> }> };
    const ands = pipeline.$and;
    const dateClause = ands.find((c) => c.$or && c.$or.some((clause) => clause.confirmedAt));
    expect(dateClause).toBeDefined();
    expect(dateClause?.$or?.[0]?.confirmedAt?.$gte).toEqual(new Date('2026-08-14T00:00:00.000Z'));
  });

  it('counts confirmed orders in date range using confirmedAt filter', async () => {
    const { service, model } = mockOrdersModel([docA]);

    await service.counts({
      after: '2026-08-14T00:00:00.000Z',
      before: '2026-08-14T23:59:59.999Z',
    });

    type AggregatePipeline = Array<{
      $facet: {
        confirmed: Array<{
          $match: {
            $and: Array<{ $or?: Array<{ confirmedAt?: { $gte?: Date } }> }>;
          };
        }>;
      };
    }>;
    const pipeline = model.aggregate.mock.calls[0][0] as AggregatePipeline;
    const facet = pipeline[0].$facet;
    const confirmedMatch = facet.confirmed[0].$match.$and;
    const dateClause = confirmedMatch.find((c) => c.$or);
    expect(dateClause).toBeDefined();
    expect(dateClause?.$or?.[0]?.confirmedAt?.$gte).toEqual(new Date('2026-08-14T00:00:00.000Z'));
  });
});
