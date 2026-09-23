import { PayrollService } from './payroll.service';

function fakeTxnDb() {
  return {
    startSession: async () => ({
      withTransaction: async (fn: () => Promise<unknown>) => fn(),
      endSession: async () => {},
    }),
  };
}

function fakeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sess-1',
    employeeId: 'emp-1',
    clockIn: new Date('2026-03-01T08:00:00.000Z'),
    clockOut: new Date('2026-03-01T12:00:00.000Z'),
    durationMinutes: 240,
    status: 'CLOSED',
    payrollPaymentId: null,
    ...overrides,
  };
}

function fakeEmployee(overrides: Record<string, unknown> = {}) {
  return { id: 'emp-1', firstName: 'Ahmed', lastName: 'Ben Ali', hourlyRateMinor: 6000, active: true, save: jest.fn().mockResolvedValue(undefined), ...overrides };
}

/** `sessions.find(...).sort(...)` is the only chained call PayrollService
 *  makes on the sessions model — a minimal thenable+chainable fake. */
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

function serviceWith(parts: {
  employees?: Record<string, unknown>;
  sessions?: Record<string, unknown>;
  payments?: Record<string, unknown>;
  counters?: Record<string, unknown>;
  audit?: Record<string, unknown>;
}) {
  const sessions = { find: jest.fn().mockReturnValue(findResult([])), updateMany: jest.fn().mockResolvedValue(undefined), aggregate: jest.fn().mockResolvedValue([]), db: fakeTxnDb(), ...parts.sessions };
  const employees = { findById: jest.fn().mockResolvedValue(null), find: jest.fn().mockResolvedValue([]), ...parts.employees };
  const payments = { create: jest.fn(), find: jest.fn().mockReturnValue(findResult([])), countDocuments: jest.fn().mockResolvedValue(0), findById: jest.fn().mockResolvedValue(null), aggregate: jest.fn().mockResolvedValue([]), ...parts.payments };
  const counters = { next: jest.fn().mockResolvedValue(1), ...parts.counters };
  const audit = { log: jest.fn().mockResolvedValue(undefined), ...parts.audit };
  return new PayrollService(employees as never, sessions as never, payments as never, counters as never, audit as never);
}

describe('PayrollService.unpaidSummary', () => {
  it('computes unpaidAmountMinor from minutes and the employee current rate', async () => {
    const sessions = {
      aggregate: jest.fn().mockResolvedValue([
        { _id: 'emp-1', unpaidMinutes: 120, periodStart: new Date('2026-03-01T08:00:00.000Z'), periodEnd: new Date('2026-03-01T10:00:00.000Z') },
      ]),
    };
    const employees = { find: jest.fn().mockResolvedValue([fakeEmployee({ hourlyRateMinor: 6000 })]) };
    const payments = { aggregate: jest.fn().mockResolvedValue([]) };
    const service = serviceWith({ sessions, employees, payments });

    const result = await service.unpaidSummary();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ employeeId: 'emp-1', unpaidMinutes: 120, unpaidAmountMinor: 12000 }); // 2h * 6000
  });

  it('returns an empty list when nothing is unpaid', async () => {
    const service = serviceWith({});
    expect(await service.unpaidSummary()).toEqual([]);
  });
});

describe('PayrollService.createPayment', () => {
  it('throws when the employee does not exist', async () => {
    const service = serviceWith({ employees: { findById: jest.fn().mockResolvedValue(null) } });
    await expect(service.createPayment('missing', { hourlyRateMinor: 6000, paymentMethod: 'cash' }, { type: 'employee', id: 'a', name: 'Admin' })).rejects.toThrow('introuvable');
  });

  it('throws when there are no unpaid closed sessions', async () => {
    const service = serviceWith({
      employees: { findById: jest.fn().mockResolvedValue(fakeEmployee()) },
      sessions: { find: jest.fn().mockReturnValue(findResult([])) },
    });
    await expect(service.createPayment('emp-1', { hourlyRateMinor: 6000, paymentMethod: 'cash' }, { type: 'employee', id: 'a', name: 'Admin' })).rejects.toThrow('Aucune heure impayée');
  });

  it('rejects an invalid hourly rate before ever looking at sessions', async () => {
    const employees = { findById: jest.fn().mockResolvedValue(fakeEmployee()) };
    const sessions = { find: jest.fn() };
    const service = serviceWith({ employees, sessions });
    await expect(
      service.createPayment('emp-1', { hourlyRateMinor: -100, paymentMethod: 'cash' }, { type: 'employee', id: 'a', name: 'Admin' }),
    ).rejects.toThrow('Prix de l\'heure invalide');
    expect(sessions.find).not.toHaveBeenCalled();
  });

  it('computes base/final amounts at the typed-in rate, snapshots it, stamps sessions, remembers the rate on the employee, and audits', async () => {
    const s1 = fakeSession({ id: 's1', durationMinutes: 240 });
    const s2 = fakeSession({ id: 's2', durationMinutes: 120, clockIn: new Date('2026-03-02T08:00:00.000Z'), clockOut: new Date('2026-03-02T10:00:00.000Z') });
    const created = { id: 'pay-1', payrollNumber: 'PAY-00001' };
    const employee = fakeEmployee({ hourlyRateMinor: 5000 }); // stale rate — the calculator's typed rate must win
    const employees = { findById: jest.fn().mockResolvedValue(employee) };
    const sessions = { find: jest.fn().mockReturnValue(findResult([s1, s2])), updateMany: jest.fn().mockResolvedValue(undefined), db: fakeTxnDb() };
    const payments = { create: jest.fn().mockResolvedValue([created]) };
    const counters = { next: jest.fn().mockResolvedValue(1) };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const service = serviceWith({ employees, sessions, payments, counters, audit });

    const result = await service.createPayment('emp-1', { hourlyRateMinor: 6000, paymentMethod: 'cash', bonusMinor: 1000, deductionMinor: 500 }, { type: 'employee', id: 'admin-1', name: 'Admin' });

    // 360 min total * 6000/h / 60 = 36000 base; +1000 bonus -500 deduction = 36500
    expect(payments.create).toHaveBeenCalledWith(
      [expect.objectContaining({ totalMinutes: 360, hourlyRateMinorSnapshot: 6000, baseAmountMinor: 36000, bonusMinor: 1000, deductionMinor: 500, finalAmountMinor: 36500, sessionIds: ['s1', 's2'] })],
      expect.anything(),
    );
    expect(sessions.updateMany).toHaveBeenCalledWith({ _id: { $in: ['s1', 's2'] } }, { $set: { payrollPaymentId: 'pay-1' } }, expect.anything());
    expect(employee.hourlyRateMinor).toBe(6000);
    expect(employee.save).toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'payroll.pay', entityId: 'pay-1' }));
    expect(result).toBe(created);
  });

  it('rejects a negative bonus/deduction before touching sessions', async () => {
    const employees = { findById: jest.fn().mockResolvedValue(fakeEmployee()) };
    const sessions = { find: jest.fn() };
    const service = serviceWith({ employees, sessions });
    await expect(
      service.createPayment('emp-1', { hourlyRateMinor: 6000, paymentMethod: 'cash', bonusMinor: -100 }, { type: 'employee', id: 'a', name: 'Admin' }),
    ).rejects.toThrow('Prime invalide');
    expect(sessions.find).not.toHaveBeenCalled();
  });

  it('rejects when a deduction exceeds the base + bonus, producing a negative final amount', async () => {
    const s1 = fakeSession({ id: 's1', durationMinutes: 60 });
    const employees = { findById: jest.fn().mockResolvedValue(fakeEmployee({ hourlyRateMinor: 6000 })) };
    const sessions = { find: jest.fn().mockReturnValue(findResult([s1])), db: fakeTxnDb() };
    const service = serviceWith({ employees, sessions });
    await expect(
      service.createPayment('emp-1', { hourlyRateMinor: 6000, paymentMethod: 'cash', deductionMinor: 999999 }, { type: 'employee', id: 'a', name: 'Admin' }),
    ).rejects.toThrow('ne peut pas être négatif');
  });
});

describe('PayrollService.summary', () => {
  it('combines all-time paid totals with the current unpaid total', async () => {
    const payments = { aggregate: jest.fn().mockResolvedValue([{ _id: null, total: 500000, count: 12 }]) };
    const sessions = {
      aggregate: jest.fn().mockResolvedValue([
        { _id: 'emp-1', unpaidMinutes: 120, periodStart: new Date(), periodEnd: new Date() },
      ]),
    };
    const employees = { find: jest.fn().mockResolvedValue([fakeEmployee({ hourlyRateMinor: 6000 })]) };
    const service = serviceWith({ payments, sessions, employees });

    const result = await service.summary();

    expect(result).toEqual({ totalPaidMinor: 500000, paymentCount: 12, totalUnpaidMinor: 12000 });
  });

  it('defaults to zero when there are no payments yet', async () => {
    const service = serviceWith({});
    expect(await service.summary()).toEqual({ totalPaidMinor: 0, paymentCount: 0, totalUnpaidMinor: 0 });
  });
});

describe('PayrollService.listPayments / getPayment', () => {
  it('lists payments with the employee name resolved', async () => {
    const doc = { id: 'pay-1', payrollNumber: 'PAY-00001', employeeId: 'emp-1', sessionIds: ['s1'], periodStart: new Date(), periodEnd: new Date(), totalMinutes: 60, hourlyRateMinorSnapshot: 6000, baseAmountMinor: 6000, bonusMinor: 0, deductionMinor: 0, finalAmountMinor: 6000, paymentMethod: 'cash', paidAt: new Date(), paidById: 'a', paidByName: 'Admin', note: '' };
    const payments = { find: jest.fn().mockReturnValue(findResult([doc])), countDocuments: jest.fn().mockResolvedValue(1) };
    const employees = { find: jest.fn().mockResolvedValue([fakeEmployee()]) };
    const service = serviceWith({ payments, employees });
    const result = await service.listPayments({});
    expect(result.items[0]).toMatchObject({ id: 'pay-1', employeeName: 'Ahmed Ben Ali' });
  });

  it('getPayment throws when the payment is missing', async () => {
    const service = serviceWith({ payments: { findById: jest.fn().mockResolvedValue(null) } });
    await expect(service.getPayment('missing')).rejects.toThrow('Paiement introuvable');
  });
});
