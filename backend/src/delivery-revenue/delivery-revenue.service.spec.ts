import { DeliveryRevenueService } from './delivery-revenue.service';

function findResult(items: unknown[]) {
  const promise = Promise.resolve(items);
  const chain: Record<string, unknown> = {
    sort: () => chain,
    skip: () => chain,
    limit: () => chain,
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
  };
  return chain;
}

function fakeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    orderNumber: 1001,
    status: 'completed',
    customer: { firstName: 'Ahmed', lastName: 'Ben Ali', phone: '20000000' },
    totalMinor: 58000,
    manualTotalMinor: null,
    subtotalMinor: 55000,
    shippingMinor: 3000,
    delivery: { status: 'DELIVERED', deliveredAt: new Date('2026-09-22T13:32:00.000Z'), provider: 'firstdelivery', manual: false, manualReason: null as string | null, manualBy: null as Record<string, unknown> | null },
    carrier: { firstdelivery: { tracking: 'FD123456' }, navex: null, axess: null },
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function serviceWith(orders: Record<string, unknown>, audit: Record<string, unknown> = { log: jest.fn().mockResolvedValue(undefined) }) {
  return new DeliveryRevenueService(orders as never, audit as never);
}

describe('DeliveryRevenueService.summary', () => {
  it('computes gross/net/returns and average basket from the aggregation result', async () => {
    const orders = {
      aggregate: jest.fn().mockResolvedValue([
        { _id: null, grossRevenueMinor: 100000, deliveredCount: 4, productRevenueMinor: 90000, shippingRevenueMinor: 10000, returnsRevenueMinor: 20000, returnedCount: 1 },
      ]),
    };
    const service = serviceWith(orders);
    const result = await service.summary('today');
    expect(result).toEqual({
      grossRevenueMinor: 100000,
      returnsRevenueMinor: 20000,
      netRevenueMinor: 80000,
      deliveredCount: 4,
      returnedCount: 1,
      averageBasketMinor: 25000,
      productRevenueMinor: 90000,
      shippingRevenueMinor: 10000,
    });
  });

  it('returns all zeros when nothing was delivered in range', async () => {
    const orders = { aggregate: jest.fn().mockResolvedValue([]) };
    const service = serviceWith(orders);
    const result = await service.summary('today');
    expect(result).toEqual({
      grossRevenueMinor: 0, returnsRevenueMinor: 0, netRevenueMinor: 0, deliveredCount: 0,
      returnedCount: 0, averageBasketMinor: 0, productRevenueMinor: 0, shippingRevenueMinor: 0,
    });
  });

  it('matches only delivery.status DELIVERED within the resolved deliveredAt range — never createdAt/confirmedAt/status', async () => {
    const orders = { aggregate: jest.fn().mockResolvedValue([]) };
    const service = serviceWith(orders);
    await service.summary('thisWeek');
    const pipeline = orders.aggregate.mock.calls[0][0];
    expect(pipeline[0].$match).toMatchObject({ 'delivery.status': 'DELIVERED' });
    expect(pipeline[0].$match).toHaveProperty(['delivery.deliveredAt']);
    expect(pipeline[0].$match).not.toHaveProperty(['createdAt']);
    expect(pipeline[0].$match).not.toHaveProperty(['confirmedAt']);
    expect(pipeline[0].$match).not.toHaveProperty(['status']);
  });
});

describe('DeliveryRevenueService.byDay / byProvider', () => {
  it('byDay groups by Africa/Tunis calendar date of deliveredAt', async () => {
    const orders = {
      aggregate: jest.fn().mockResolvedValue([
        { _id: '2026-09-21', deliveredCount: 35, revenueMinor: 1850000 },
        { _id: '2026-09-22', deliveredCount: 42, revenueMinor: 2240000 },
      ]),
    };
    const service = serviceWith(orders);
    const result = await service.byDay('thisWeek');
    expect(result).toEqual([
      { date: '2026-09-21', deliveredCount: 35, revenueMinor: 1850000 },
      { date: '2026-09-22', deliveredCount: 42, revenueMinor: 2240000 },
    ]);
    const groupStage = orders.aggregate.mock.calls[0][0][1].$group;
    expect(groupStage._id).toEqual({ $dateToString: { format: '%Y-%m-%d', date: '$delivery.deliveredAt', timezone: 'Africa/Tunis' } });
  });

  it('byProvider sums equal the overall total when combined', async () => {
    const orders = {
      aggregate: jest.fn().mockResolvedValue([
        { _id: 'navex', deliveredCount: 120, revenueMinor: 6800000 },
        { _id: 'firstdelivery', deliveredCount: 85, revenueMinor: 4500000 },
        { _id: 'axess', deliveredCount: 32, revenueMinor: 1550000 },
      ]),
    };
    const service = serviceWith(orders);
    const result = await service.byProvider('thisMonth');
    const totalFromProviders = result.reduce((sum, r) => sum + r.revenueMinor, 0);
    expect(totalFromProviders).toBe(6800000 + 4500000 + 1550000);
    expect(result.map((r) => r.provider)).toEqual(['navex', 'firstdelivery', 'axess']);
  });

  it('byProvider groups manual (carrier-less) confirmations under "manual"', async () => {
    const orders = { aggregate: jest.fn().mockResolvedValue([{ _id: 'manual', deliveredCount: 2, revenueMinor: 100000 }]) };
    const service = serviceWith(orders);
    const result = await service.byProvider('today');
    expect(result[0].provider).toBe('manual');
    const groupStage = orders.aggregate.mock.calls[0][0][1].$group;
    expect(groupStage._id).toEqual({ $ifNull: ['$delivery.provider', 'manual'] });
  });
});

describe('DeliveryRevenueService.orderList', () => {
  it('maps orders to the drill-down row shape, resolving tracking from the confirmed provider', async () => {
    const order = fakeOrder();
    const orders = { find: jest.fn().mockReturnValue(findResult([order])), countDocuments: jest.fn().mockResolvedValue(1) };
    const service = serviceWith(orders);
    const result = await service.orderList({ preset: 'today' });
    expect(result.items[0]).toMatchObject({
      id: 'order-1', orderNumber: 1001, customerName: 'Ahmed Ben Ali', phone: '20000000',
      provider: 'firstdelivery', tracking: 'FD123456', totalMinor: 58000, returned: false, manual: false,
    });
    expect(result.total).toBe(1);
  });

  it('flags a delivered-then-returned order as returned', async () => {
    const order = fakeOrder({ status: 'retourne' });
    const orders = { find: jest.fn().mockReturnValue(findResult([order])), countDocuments: jest.fn().mockResolvedValue(1) };
    const service = serviceWith(orders);
    const result = await service.orderList({ preset: 'today' });
    expect(result.items[0].returned).toBe(true);
  });

  it('uses manualTotalMinor over totalMinor when an admin override exists', async () => {
    const order = fakeOrder({ manualTotalMinor: 50000 });
    const orders = { find: jest.fn().mockReturnValue(findResult([order])), countDocuments: jest.fn().mockResolvedValue(1) };
    const service = serviceWith(orders);
    const result = await service.orderList({ preset: 'today' });
    expect(result.items[0].totalMinor).toBe(50000);
  });

  it('filters by provider, translating "manual" to a null carrier match', async () => {
    const orders = { find: jest.fn().mockReturnValue(findResult([])), countDocuments: jest.fn().mockResolvedValue(0) };
    const service = serviceWith(orders);
    await service.orderList({ preset: 'today', provider: 'manual' });
    expect(orders.find).toHaveBeenCalledWith(expect.objectContaining({ 'delivery.provider': null }));
  });
});

describe('DeliveryRevenueService.markDelivered', () => {
  const actor = { type: 'employee' as const, id: 'admin-1', name: 'Admin' };

  it('requires a non-empty reason', async () => {
    const orders = { findById: jest.fn() };
    const service = serviceWith(orders);
    await expect(service.markDelivered('order-1', '  ', actor)).rejects.toThrow('motif');
    expect(orders.findById).not.toHaveBeenCalled();
  });

  it('throws when the order does not exist', async () => {
    const orders = { findById: jest.fn().mockResolvedValue(null) };
    const service = serviceWith(orders);
    await expect(service.markDelivered('missing', 'Confirmé par téléphone', actor)).rejects.toThrow('introuvable');
  });

  it('refuses to override an already carrier-confirmed delivery', async () => {
    const order = fakeOrder({ delivery: { status: 'DELIVERED', deliveredAt: new Date(), provider: 'navex', manual: false } });
    const orders = { findById: jest.fn().mockResolvedValue(order) };
    const service = serviceWith(orders);
    await expect(service.markDelivered('order-1', 'Confirmé par téléphone', actor)).rejects.toThrow('déjà');
  });

  it('sets delivery fields, saves, and audits with a required reason', async () => {
    const order = fakeOrder({ delivery: { status: null, deliveredAt: null, provider: null, manual: false } });
    const orders = { findById: jest.fn().mockResolvedValue(order) };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const service = serviceWith(orders, audit);

    await service.markDelivered('order-1', 'Client confirmé par téléphone', actor);

    expect(order.delivery.status).toBe('DELIVERED');
    expect(order.delivery.manual).toBe(true);
    expect(order.delivery.manualReason).toBe('Client confirmé par téléphone');
    expect(order.delivery.manualBy).toEqual(actor);
    expect(order.delivery.deliveredAt).toBeInstanceOf(Date);
    expect(order.save).toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'delivery.manual_confirm', entityId: 'order-1' }));
  });
});
