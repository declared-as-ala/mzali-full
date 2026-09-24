import { CleanupProcessor } from './cleanup.processor';

/** `orders.find(...).sort(...).limit(...)` — a minimal thenable+chainable fake. */
function findResult(items: unknown[]) {
  const promise = Promise.resolve(items);
  const chain: Record<string, unknown> = {
    sort: () => chain,
    limit: () => chain,
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
  };
  return chain;
}

function fakeOrder(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'order-1',
    id: 'order-1',
    carrier: { navex: null, firstdelivery: null, axess: null },
    ...overrides,
  };
}

/** Fills in missing mock methods on the CALLER's own object (mutating it
 *  in place) instead of spreading into a new one — so a test's local
 *  `orders`/`navex`/etc. reference stays the exact object the processor
 *  actually calls, and later `expect(orders.updateOne)...` assertions
 *  see the real calls even when the test itself never set up that method. */
function withDefaults<T extends Record<string, unknown>>(obj: T | undefined, defaults: Record<string, unknown>): T {
  const target = (obj ?? {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(defaults)) if (!(k in target)) target[k] = v;
  return target as T;
}

function processorWith(parts: { orders?: Record<string, unknown>; navex?: Record<string, unknown>; firstDelivery?: Record<string, unknown>; axess?: Record<string, unknown> }) {
  const orders = withDefaults(parts.orders, {
    find: jest.fn().mockReturnValue(findResult([])),
    updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 }),
  });
  const navex = withDefaults(parts.navex, { getState: jest.fn().mockResolvedValue({ ok: false, raw: null }) });
  const firstDelivery = withDefaults(parts.firstDelivery, { getState: jest.fn().mockResolvedValue({ ok: false, raw: null }) });
  const axess = withDefaults(parts.axess, { getState: jest.fn().mockResolvedValue({ ok: false, raw: null }) });
  const lowStockCheck = { run: jest.fn().mockResolvedValue(undefined) };
  return new CleanupProcessor(orders as never, lowStockCheck as never, navex as never, firstDelivery as never, axess as never);
}

describe('CleanupProcessor.syncDeliveryStatus', () => {
  it('marks an order delivered when the carrier reports a delivered status, and writes rawStatus/deliveredAt/provider', async () => {
    const order = fakeOrder({ carrier: { navex: { status: 'sent', tracking: 'BC123' }, firstdelivery: null, axess: null } });
    const orders: Record<string, jest.Mock> = { find: jest.fn().mockReturnValue(findResult([order])) };
    const navex = { getState: jest.fn().mockResolvedValue({ ok: true, raw: { etat: 'Livré' } }) };
    const processor = processorWith({ orders, navex });

    await processor.syncDeliveryStatus();

    expect(orders.updateOne).toHaveBeenCalledWith(
      { _id: 'order-1', 'delivery.status': { $ne: 'DELIVERED' } },
      { $set: expect.objectContaining({ 'delivery.status': 'DELIVERED', 'delivery.provider': 'navex', 'delivery.rawStatus': 'Livré' }) },
    );
  });

  it('does not mark delivered when the carrier reports an in-transit status, but still updates lastCheckedAt/rawStatus', async () => {
    const order = fakeOrder({ carrier: { navex: { status: 'sent', tracking: 'BC123' }, firstdelivery: null, axess: null } });
    const orders: Record<string, jest.Mock> = { find: jest.fn().mockReturnValue(findResult([order])) };
    const navex = { getState: jest.fn().mockResolvedValue({ ok: true, raw: { etat: 'En livraison' } }) };
    const processor = processorWith({ orders, navex });

    await processor.syncDeliveryStatus();

    expect(orders.updateOne).toHaveBeenCalledWith(
      { _id: 'order-1' },
      { $set: expect.objectContaining({ 'delivery.rawStatus': 'En livraison' }) },
    );
    expect(orders.updateOne).not.toHaveBeenCalledWith(
      expect.objectContaining({ 'delivery.status': { $ne: 'DELIVERED' } }),
      expect.anything(),
    );
  });

  it('routes to the correct carrier service based on which one has a successful push', async () => {
    const order = fakeOrder({ carrier: { navex: null, firstdelivery: { status: 'sent', tracking: 'FD999' }, axess: null } });
    const orders: Record<string, jest.Mock> = { find: jest.fn().mockReturnValue(findResult([order])) };
    const firstDelivery = { getState: jest.fn().mockResolvedValue({ ok: true, raw: { etat: 'Livré' } }) };
    const navex = { getState: jest.fn() };
    const processor = processorWith({ orders, navex, firstDelivery });

    await processor.syncDeliveryStatus();

    expect(firstDelivery.getState).toHaveBeenCalledWith('FD999');
    expect(navex.getState).not.toHaveBeenCalled();
  });

  it('skips an order with no carrier successfully pushed', async () => {
    const order = fakeOrder({ carrier: { navex: { status: 'failed', tracking: null }, firstdelivery: null, axess: null } });
    const orders: Record<string, jest.Mock> = { find: jest.fn().mockReturnValue(findResult([order])) };
    const navex = { getState: jest.fn() };
    const processor = processorWith({ orders, navex });

    await processor.syncDeliveryStatus();

    expect(navex.getState).not.toHaveBeenCalled();
    expect(orders.updateOne).not.toHaveBeenCalled();
  });

  it('a failed carrier API call still updates lastCheckedAt without touching delivery status', async () => {
    const order = fakeOrder({ carrier: { navex: { status: 'sent', tracking: 'BC123' }, firstdelivery: null, axess: null } });
    const orders: Record<string, jest.Mock> = { find: jest.fn().mockReturnValue(findResult([order])) };
    const navex = { getState: jest.fn().mockResolvedValue({ ok: false, raw: null, error: 'timeout' }) };
    const processor = processorWith({ orders, navex });

    await processor.syncDeliveryStatus();

    expect(orders.updateOne).toHaveBeenCalledWith({ _id: 'order-1' }, { $set: { 'delivery.lastCheckedAt': expect.any(Date) } });
  });

  it('a thrown network error is caught and does not stop the batch', async () => {
    const orderA = fakeOrder({ _id: 'order-a', id: 'order-a', carrier: { navex: { status: 'sent', tracking: 'A' }, firstdelivery: null, axess: null } });
    const orderB = fakeOrder({ _id: 'order-b', id: 'order-b', carrier: { navex: { status: 'sent', tracking: 'B' }, firstdelivery: null, axess: null } });
    const orders: Record<string, jest.Mock> = { find: jest.fn().mockReturnValue(findResult([orderA, orderB])) };
    const navex = {
      getState: jest.fn()
        .mockRejectedValueOnce(new Error('network down'))
        .mockResolvedValueOnce({ ok: true, raw: { etat: 'Livré' } }),
    };
    const processor = processorWith({ orders, navex });

    await expect(processor.syncDeliveryStatus()).resolves.toBeUndefined();
    expect(navex.getState).toHaveBeenCalledTimes(2);
    expect(orders.updateOne).toHaveBeenCalledWith(
      { _id: 'order-b', 'delivery.status': { $ne: 'DELIVERED' } },
      expect.objectContaining({ $set: expect.objectContaining({ 'delivery.status': 'DELIVERED' }) }),
    );
  });

  it('a duplicate delivered event (already-delivered order) is excluded from the candidate query itself', async () => {
    // The query filter `'delivery.status': { $ne: 'DELIVERED' }` is what the
    // real Mongo query would apply — here we assert the find() call used it,
    // proving an already-delivered order can never be re-processed.
    const orders: Record<string, jest.Mock> = { find: jest.fn().mockReturnValue(findResult([])) };
    const processor = processorWith({ orders });

    await processor.syncDeliveryStatus();

    expect(orders.find).toHaveBeenCalledWith(
      expect.objectContaining({ 'delivery.status': { $ne: 'DELIVERED' } }),
    );
  });
});
