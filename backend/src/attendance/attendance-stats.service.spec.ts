import { AttendanceStatsService } from './attendance-stats.service';
import { attendanceBusinessDate, tunisToday } from './attendance-date';

/** Mongoose `find(...)` is called two ways in this service: awaited
 *  directly (dashboard/minutesInRange) and chained with
 *  `.sort().skip().limit()` (listSessions). This fake supports both by
 *  being both a Promise-like (`.then`) and chainable (each chain method
 *  returns itself). */
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

function fakeSessionsModel(overrides: Record<string, unknown> = {}) {
  return {
    aggregate: jest.fn().mockResolvedValue([]),
    find: jest.fn().mockReturnValue(findResult([])),
    countDocuments: jest.fn().mockResolvedValue(0),
    distinct: jest.fn().mockResolvedValue([]),
    findById: jest.fn().mockResolvedValue(null),
    ...overrides,
  };
}

function fakeEmployeesModel(overrides: Record<string, unknown> = {}) {
  return {
    find: jest.fn().mockResolvedValue([]),
    findById: jest.fn().mockResolvedValue(null),
    ...overrides,
  };
}

function fakeAudit() {
  return { log: jest.fn().mockResolvedValue(undefined) };
}

function serviceWith(employees: Record<string, unknown>, sessions: Record<string, unknown>, audit = fakeAudit()) {
  return new AttendanceStatsService(employees as never, sessions as never, audit as never);
}

describe('AttendanceStatsService.dashboard', () => {
  it('counts present employees, live-elapsed minutes, and distinct clock-ins today', async () => {
    const openSession = {
      employeeId: 'emp-1',
      clockIn: new Date(Date.now() - 90 * 60000), // 90 minutes ago
    };
    const sessions = fakeSessionsModel({
      find: jest.fn((query: Record<string, unknown>) => {
        if (query.status === 'OPEN' && !('businessDate' in query)) return findResult([openSession]);
        if (query.status === 'OPEN') return findResult([openSession]); // minutesInRange's open-sessions lookup
        return findResult([]);
      }),
      countDocuments: jest.fn().mockResolvedValue(1),
      distinct: jest.fn().mockResolvedValue(['emp-1']),
      aggregate: jest.fn().mockResolvedValue([]), // no CLOSED sessions today
    });
    const employees = fakeEmployeesModel({ find: jest.fn().mockResolvedValue([{ id: 'emp-1', firstName: 'Ahmed', lastName: 'Ben Ali' }]) });
    const service = serviceWith(employees, sessions);

    const result = await service.dashboard();

    expect(result.presentNow).toBe(1);
    expect(result.employeesClockedToday).toBe(1);
    expect(result.present).toHaveLength(1);
    expect(result.present[0]).toMatchObject({ employeeId: 'emp-1', firstName: 'Ahmed', currentMinutes: 90 });
    expect(result.hoursTodayMinutes).toBeGreaterThanOrEqual(90);
  });

  it('falls back to an em-dash placeholder when the employee record is missing', async () => {
    const openSession = { employeeId: 'ghost', clockIn: new Date() };
    const sessions = fakeSessionsModel({ find: jest.fn().mockReturnValue(findResult([openSession])) });
    const employees = fakeEmployeesModel({ find: jest.fn().mockResolvedValue([]) });
    const service = serviceWith(employees, sessions);
    const result = await service.dashboard();
    expect(result.present[0]).toMatchObject({ firstName: '—', lastName: '' });
  });
});

describe('AttendanceStatsService.listSessions', () => {
  it('builds the businessDate range filter and paginates', async () => {
    const findSpy = jest.fn().mockReturnValue(findResult([{ id: 's1', employeeId: 'emp-1', clockIn: new Date(), clockOut: null, durationMinutes: null, status: 'OPEN', businessDate: '2026-03-18', source: null, payrollPaymentId: null, correction: null }]));
    const sessions = fakeSessionsModel({ find: findSpy, countDocuments: jest.fn().mockResolvedValue(1) });
    const employees = fakeEmployeesModel({ find: jest.fn().mockResolvedValue([{ id: 'emp-1', firstName: 'Sami', lastName: 'K' }]) });
    const service = serviceWith(employees, sessions);

    const result = await service.listSessions({ employeeId: 'emp-1', from: '2026-03-01', to: '2026-03-18', page: 1, perPage: 20 });

    expect(findSpy).toHaveBeenCalledWith({ employeeId: 'emp-1', businessDate: { $gte: '2026-03-01', $lte: '2026-03-18' } });
    expect(result.items[0]).toMatchObject({ id: 's1', employeeName: 'Sami K' });
    expect(result.total).toBe(1);
  });
});

describe('AttendanceStatsService.employeeSummary', () => {
  it('throws when the employee does not exist', async () => {
    const employees = fakeEmployeesModel({ findById: jest.fn().mockResolvedValue(null) });
    const sessions = fakeSessionsModel();
    const service = serviceWith(employees, sessions);
    await expect(service.employeeSummary('missing', { unpaidMinutes: 0, unpaidAmountMinor: 0 }, 0)).rejects.toThrow('introuvable');
  });

  it('returns today/week/month minutes alongside the passed-in unpaid/paid totals', async () => {
    const employeeDoc = {
      id: 'emp-1', firstName: 'Ahmed', lastName: 'Ben Ali', phone: '20000000', email: null, jobTitle: '', photoUrl: null,
      hourlyRateMinor: 5500, active: true, hiredAt: null, notes: '',
      createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'),
    };
    const employees = fakeEmployeesModel({ findById: jest.fn().mockResolvedValue(employeeDoc) });
    const sessions = fakeSessionsModel({ aggregate: jest.fn().mockResolvedValue([{ _id: null, total: 120 }]) });
    const service = serviceWith(employees, sessions);

    const result = await service.employeeSummary('emp-1', { unpaidMinutes: 300, unpaidAmountMinor: 27500 }, 100000);

    expect(result.employee).toMatchObject({ id: 'emp-1', firstName: 'Ahmed' });
    expect(result.employee).not.toHaveProperty('pinHash');
    expect(result.unpaidMinutes).toBe(300);
    expect(result.totalPaidAmountMinor).toBe(100000);
  });
});

describe('AttendanceStatsService.topEmployees / dailyBreakdown', () => {
  it('ranks employees by summed CLOSED-session minutes within the range', async () => {
    const sessions = fakeSessionsModel({ aggregate: jest.fn().mockResolvedValue([{ _id: 'emp-1', totalMinutes: 480 }]) });
    const employees = fakeEmployeesModel({ find: jest.fn().mockResolvedValue([{ id: 'emp-1', firstName: 'Ahmed', lastName: 'Ben Ali' }]) });
    const service = serviceWith(employees, sessions);
    const result = await service.topEmployees({ from: '2026-03-01', to: '2026-03-18' });
    expect(result).toEqual([{ employeeId: 'emp-1', firstName: 'Ahmed', lastName: 'Ben Ali', totalMinutes: 480 }]);
  });

  it('returns a date-ordered daily breakdown for one employee', async () => {
    const sessions = fakeSessionsModel({
      aggregate: jest.fn().mockResolvedValue([
        { _id: '2026-03-01', minutes: 240 },
        { _id: '2026-03-02', minutes: 300 },
      ]),
    });
    const service = serviceWith(fakeEmployeesModel(), sessions);
    const result = await service.dailyBreakdown('emp-1', { from: '2026-03-01', to: '2026-03-02' });
    expect(result).toEqual([{ date: '2026-03-01', minutes: 240 }, { date: '2026-03-02', minutes: 300 }]);
  });
});

describe('AttendanceStatsService.resolvePreset', () => {
  afterEach(() => jest.useRealTimers());

  it('defaults to today when nothing is passed', () => {
    const service = serviceWith(fakeEmployeesModel(), fakeSessionsModel());
    const range = service.resolvePreset();
    expect(range).toEqual({ from: tunisToday(), to: tunisToday() });
  });

  it('an explicit from/to always wins over a preset', () => {
    const service = serviceWith(fakeEmployeesModel(), fakeSessionsModel());
    const range = service.resolvePreset('month', '2026-01-01', '2026-01-15');
    expect(range).toEqual({ from: '2026-01-01', to: '2026-01-15' });
  });

  it('"week" resolves to the current Tunis week start', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-18T10:00:00.000Z'));
    const service = serviceWith(fakeEmployeesModel(), fakeSessionsModel());
    expect(service.resolvePreset('week')).toEqual({ from: '2026-03-16', to: '2026-03-18' });
  });
});

describe('AttendanceStatsService.correctSession', () => {
  function fakeCorrectableSession(overrides: Record<string, unknown> = {}) {
    return {
      id: 'sess-1',
      clockIn: new Date('2026-03-18T08:00:00.000Z'),
      clockOut: new Date('2026-03-18T12:00:00.000Z'),
      durationMinutes: 240,
      status: 'CLOSED',
      businessDate: '2026-03-18',
      payrollPaymentId: null,
      correction: null,
      save: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    };
  }
  const actor = { type: 'employee' as const, id: 'admin-1', name: 'Admin' };

  it('requires a non-empty reason', async () => {
    const sessions = fakeSessionsModel({ findById: jest.fn().mockResolvedValue(fakeCorrectableSession()) });
    const service = serviceWith(fakeEmployeesModel(), sessions);
    await expect(service.correctSession('sess-1', { clockOut: '2026-03-18T13:00:00.000Z' }, '  ', actor)).rejects.toThrow('motif');
  });

  it('throws when the session does not exist', async () => {
    const sessions = fakeSessionsModel({ findById: jest.fn().mockResolvedValue(null) });
    const service = serviceWith(fakeEmployeesModel(), sessions);
    await expect(service.correctSession('missing', {}, 'oubli', actor)).rejects.toThrow('introuvable');
  });

  it('rejects a clockOut at or before clockIn', async () => {
    const sessions = fakeSessionsModel({ findById: jest.fn().mockResolvedValue(fakeCorrectableSession()) });
    const service = serviceWith(fakeEmployeesModel(), sessions);
    await expect(
      service.correctSession('sess-1', { clockOut: '2026-03-18T07:00:00.000Z' }, 'oubli', actor),
    ).rejects.toThrow('après l\'heure d\'arrivée');
  });

  it('refuses to correct a session that has already been paid', async () => {
    const sessions = fakeSessionsModel({ findById: jest.fn().mockResolvedValue(fakeCorrectableSession({ payrollPaymentId: 'pay-1' })) });
    const service = serviceWith(fakeEmployeesModel(), sessions);
    await expect(
      service.correctSession('sess-1', { clockOut: '2026-03-18T13:00:00.000Z' }, 'oubli', actor),
    ).rejects.toThrow('déjà été payée');
  });

  it('recomputes duration/businessDate, preserves the original values, and audits before/after', async () => {
    const doc = fakeCorrectableSession();
    const sessions = fakeSessionsModel({ findById: jest.fn().mockResolvedValue(doc) });
    const audit = fakeAudit();
    const service = serviceWith(fakeEmployeesModel(), sessions, audit);

    const result = await service.correctSession('sess-1', { clockOut: '2026-03-18T13:00:00.000Z' }, 'Employé a oublié de pointer sa sortie', actor);

    expect(result.durationMinutes).toBe(300); // 08:00 -> 13:00
    expect(result.status).toBe('CLOSED');
    expect((result.correction as { originalClockOut: Date }).originalClockOut).toEqual(new Date('2026-03-18T12:00:00.000Z'));
    expect((result.correction as { reason: string }).reason).toBe('Employé a oublié de pointer sa sortie');
    expect(doc.save).toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'attendance.session.correct', entityId: 'sess-1' }),
    );
  });

  it('resolves a NEEDS_REVIEW (forgotten clock-out) session back to CLOSED', async () => {
    const doc = fakeCorrectableSession({ status: 'NEEDS_REVIEW', clockOut: null, durationMinutes: null, businessDate: '2020-01-01', clockIn: new Date('2020-01-01T08:00:00.000Z') });
    const sessions = fakeSessionsModel({ findById: jest.fn().mockResolvedValue(doc) });
    const service = serviceWith(fakeEmployeesModel(), sessions);
    const result = await service.correctSession('sess-1', { clockOut: '2020-01-01T16:00:00.000Z' }, 'Oubli de sortie', actor);
    expect(result.status).toBe('CLOSED');
    expect(result.businessDate).toBe(attendanceBusinessDate(new Date('2020-01-01T08:00:00.000Z')));
  });
});
