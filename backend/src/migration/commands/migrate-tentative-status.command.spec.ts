import { MigrateTentativeStatusCommand } from './migrate-tentative-status.command';

function tentativeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    orderNumber: 42,
    status: 'tentative',
    attempts: 0,
    statusHistory: [] as unknown[],
    save: jest.fn(),
    ...overrides,
  };
}

describe('migrate:tentative-status', () => {
  it('maps a zero/unset attempts counter to tentative-1, not tentative-0', async () => {
    const doc = tentativeOrder({ attempts: 0 });
    const model = { find: jest.fn().mockResolvedValue([doc]) };
    const command = new MigrateTentativeStatusCommand(model as never);

    await command.run([], {});

    expect(doc.status).toBe('tentative-1');
    expect(doc.attempts).toBe(1);
    expect(doc.save).toHaveBeenCalled();
  });

  it('preserves an existing in-range attempts count', async () => {
    const doc = tentativeOrder({ attempts: 3 });
    const model = { find: jest.fn().mockResolvedValue([doc]) };
    const command = new MigrateTentativeStatusCommand(model as never);

    await command.run([], {});

    expect(doc.status).toBe('tentative-3');
    expect(doc.attempts).toBe(3);
  });

  it('clamps an out-of-range attempts count to tentative-5', async () => {
    const doc = tentativeOrder({ attempts: 99 });
    const model = { find: jest.fn().mockResolvedValue([doc]) };
    const command = new MigrateTentativeStatusCommand(model as never);

    await command.run([], {});

    expect(doc.status).toBe('tentative-5');
  });

  it('appends a statusHistory entry documenting the migration, never deletes the order', async () => {
    const doc = tentativeOrder({ attempts: 2 });
    const model = { find: jest.fn().mockResolvedValue([doc]) };
    const command = new MigrateTentativeStatusCommand(model as never);

    await command.run([], {});

    expect(doc.statusHistory).toHaveLength(1);
    expect(doc.statusHistory[0]).toMatchObject({ from: 'tentative', to: 'tentative-2' });
    expect(doc.save).toHaveBeenCalledTimes(1);
  });

  it('--dry-run reports what it would do and writes nothing', async () => {
    const doc = tentativeOrder({ attempts: 2 });
    const model = { find: jest.fn().mockResolvedValue([doc]) };
    const command = new MigrateTentativeStatusCommand(model as never);

    await command.run([], { dryRun: true });

    expect(doc.status).toBe('tentative'); // unchanged
    expect(doc.save).not.toHaveBeenCalled();
  });

  it('is idempotent: finds nothing once no order still has the legacy flat status', async () => {
    const model = { find: jest.fn().mockResolvedValue([]) };
    const command = new MigrateTentativeStatusCommand(model as never);

    await command.run([], {});

    expect(model.find).toHaveBeenCalledWith({ status: 'tentative' });
  });
});
