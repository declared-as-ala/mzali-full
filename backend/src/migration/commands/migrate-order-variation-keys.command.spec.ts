import { MigrateOrderVariationKeysCommand } from './migrate-order-variation-keys.command';

function orderDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'order-1',
    orderNumber: 42,
    items: [{ variation: { Taille: 'XL', Couleur: 'Noir' }, itemId: null, variationKey: null }],
    ...overrides,
  };
}

function makeOrdersModel(docs: Record<string, unknown>[]) {
  const cursor = { [Symbol.asyncIterator]: async function* () { for (const d of docs) yield d; } };
  return {
    find: jest.fn().mockReturnValue({ lean: () => ({ cursor: () => cursor }) }),
    bulkWrite: jest.fn().mockResolvedValue({}),
  };
}

function makeSettings(marker: Record<string, unknown> | null = null) {
  return { getRaw: jest.fn().mockResolvedValue(marker), setRaw: jest.fn().mockResolvedValue(undefined) };
}

describe('migrate:order-variation-keys — completion marker (safe to run on every deploy)', () => {
  it('skips entirely (no scan, no write) when already marked complete', async () => {
    const model = makeOrdersModel([orderDoc()]);
    const settings = makeSettings({ completedAt: '2026-01-01T00:00:00.000Z', ordersUpdated: 5 });
    const command = new MigrateOrderVariationKeysCommand(model as never, settings as never);

    await command.run([], {});

    expect(settings.getRaw).toHaveBeenCalledWith('migration:order-variation-keys');
    expect(model.find).not.toHaveBeenCalled();
    expect(model.bulkWrite).not.toHaveBeenCalled();
  });

  it('runs and sets the completion marker on a real first run', async () => {
    const model = makeOrdersModel([orderDoc()]);
    const settings = makeSettings(null);
    const command = new MigrateOrderVariationKeysCommand(model as never, settings as never);

    await command.run([], {});

    expect(model.bulkWrite).toHaveBeenCalledTimes(1);
    expect(settings.setRaw).toHaveBeenCalledWith(
      'migration:order-variation-keys',
      expect.objectContaining({ ordersUpdated: 1, itemIdsAssigned: 1, variationKeysChanged: 1 }),
    );
  });

  it('--force re-runs even when already marked complete', async () => {
    const model = makeOrdersModel([orderDoc()]);
    const settings = makeSettings({ completedAt: '2026-01-01T00:00:00.000Z' });
    const command = new MigrateOrderVariationKeysCommand(model as never, settings as never);

    await command.run([], { force: true });

    expect(model.find).toHaveBeenCalled();
    expect(model.bulkWrite).toHaveBeenCalledTimes(1);
    expect(settings.setRaw).toHaveBeenCalled();
  });

  it('--dry-run always scans regardless of the marker, and never writes or sets it', async () => {
    const model = makeOrdersModel([orderDoc()]);
    const settings = makeSettings({ completedAt: '2026-01-01T00:00:00.000Z' });
    const command = new MigrateOrderVariationKeysCommand(model as never, settings as never);

    await command.run([], { dryRun: true });

    expect(model.find).toHaveBeenCalled();
    expect(model.bulkWrite).not.toHaveBeenCalled();
    expect(settings.setRaw).not.toHaveBeenCalled();
  });

  it('a second real run after a successful first run is a no-op scan (nothing left to change)', async () => {
    // First run: item lacks itemId/variationKey — gets both assigned.
    const doc = orderDoc();
    const model = makeOrdersModel([doc]);
    const settings = makeSettings(null);
    const command = new MigrateOrderVariationKeysCommand(model as never, settings as never);
    await command.run([], {});
    const assignedItemId = (model.bulkWrite.mock.calls[0][0][0].updateOne.update.$set.items[0] as { itemId: string }).itemId;

    // Second run with --force (simulating a re-run after the marker was
    // somehow cleared, or just proving idempotency directly): the same
    // item, now already carrying itemId/variationKey, produces zero writes.
    const alreadyMigratedDoc = orderDoc({ items: [{ variation: { Taille: 'XL', Couleur: 'Noir' }, itemId: assignedItemId, variationKey: 'xl|noir' }] });
    const model2 = makeOrdersModel([alreadyMigratedDoc]);
    const command2 = new MigrateOrderVariationKeysCommand(model2 as never, settings as never);
    await command2.run([], { force: true });

    expect(model2.bulkWrite).not.toHaveBeenCalled();
  });
});
