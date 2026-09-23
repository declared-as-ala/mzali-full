import { AttendanceService } from './attendance.service';
import { hashPin } from './attendance-pin';
import { attendanceBusinessDate } from './attendance-date';

/** A fake session document with the handful of methods AttendanceService
 *  actually calls on it — enough to exercise the real decision logic in
 *  clockIn/clockOut/identify without a live Mongo replica set (which
 *  transactions require and isn't available in this environment; see
 *  agent.md). withTransaction here just awaits the callback directly —
 *  it does not prove real cross-process atomicity, only that the
 *  business logic inside the transaction is correct in isolation. */
function fakeTxnDb() {
  return {
    startSession: async () => ({
      withTransaction: async (fn: () => Promise<unknown>) => fn(),
      endSession: async () => {},
    }),
  };
}

function fakeSession(overrides: Record<string, unknown> = {}) {
  const doc: Record<string, unknown> = {
    id: 'sess-1',
    employeeId: 'emp-1',
    clockIn: new Date('2026-01-15T08:00:00.000Z'),
    clockOut: null,
    durationMinutes: null,
    status: 'OPEN',
    businessDate: attendanceBusinessDate(new Date('2026-01-15T08:00:00.000Z')),
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return doc;
}

async function fakeEmployee(pin: string, overrides: Record<string, unknown> = {}) {
  return {
    id: 'emp-1',
    firstName: 'Ahmed',
    lastName: 'Ben Ali',
    active: true,
    pinHash: await hashPin(pin),
    hourlyRateMinor: 5500,
    ...overrides,
  };
}

function serviceWith(employeesModel: Record<string, unknown>, sessionsModel: Record<string, unknown>) {
  return new AttendanceService(employeesModel as never, { ...sessionsModel, db: fakeTxnDb() } as never);
}

describe('AttendanceService.identify — kiosk state machine', () => {
  it('returns ok:false for a PIN matching no active employee', async () => {
    const employees = { find: jest.fn().mockResolvedValue([]) };
    const sessions = { findOne: jest.fn() };
    const service = serviceWith(employees, sessions);
    expect(await service.identify('0000')).toEqual({ ok: false });
  });

  it('never matches an inactive employee, even with the correct PIN', async () => {
    // find({active:true}) itself is what filters — simulate that the
    // inactive employee is correctly excluded from the query results.
    const employees = { find: jest.fn().mockResolvedValue([]) };
    const sessions = { findOne: jest.fn() };
    const service = serviceWith(employees, sessions);
    const result = await service.identify('4821');
    expect(result).toEqual({ ok: false });
    expect(employees.find).toHaveBeenCalledWith({ active: true });
  });

  it('ready_to_start when the employee has no open session', async () => {
    const employee = await fakeEmployee('4821');
    const employees = { find: jest.fn().mockResolvedValue([employee]) };
    const sessions = { findOne: jest.fn().mockResolvedValue(null) };
    const service = serviceWith(employees, sessions);
    const result = await service.identify('4821');
    expect(result).toMatchObject({ ok: true, status: 'ready_to_start' });
  });

  it('ready_to_end when the employee has an open session from today', async () => {
    const employee = await fakeEmployee('4821');
    const openToday = fakeSession({ businessDate: attendanceBusinessDate(new Date()), clockIn: new Date() });
    const employees = { find: jest.fn().mockResolvedValue([employee]) };
    const sessions = { findOne: jest.fn().mockResolvedValue(openToday) };
    const service = serviceWith(employees, sessions);
    const result = await service.identify('4821');
    expect(result).toMatchObject({ ok: true, status: 'ready_to_end' });
  });

  it('blocked_stale_session for a forgotten open session from a previous day, and flags it NEEDS_REVIEW', async () => {
    const employee = await fakeEmployee('4821');
    const staleOpen = fakeSession({ businessDate: '2020-01-01', status: 'OPEN' });
    const employees = { find: jest.fn().mockResolvedValue([employee]) };
    const sessions = { findOne: jest.fn().mockResolvedValue(staleOpen) };
    const service = serviceWith(employees, sessions);
    const result = await service.identify('4821');
    expect(result).toMatchObject({ ok: true, status: 'blocked_stale_session' });
    expect(staleOpen.status).toBe('NEEDS_REVIEW');
    expect(staleOpen.save).toHaveBeenCalled();
  });

  it('stays blocked_stale_session on a repeat identify() without re-flagging or erroring', async () => {
    const employee = await fakeEmployee('4821');
    const alreadyFlagged = fakeSession({ businessDate: '2020-01-01', status: 'NEEDS_REVIEW' });
    const employees = { find: jest.fn().mockResolvedValue([employee]) };
    const sessions = { findOne: jest.fn().mockResolvedValue(alreadyFlagged) };
    const service = serviceWith(employees, sessions);
    const result = await service.identify('4821');
    expect(result).toMatchObject({ ok: true, status: 'blocked_stale_session' });
    expect(alreadyFlagged.save).not.toHaveBeenCalled();
  });
});

describe('AttendanceService — PIN uniqueness (create/reset)', () => {
  it('rejects creating an employee with a PIN already used by another active employee', async () => {
    const other = await fakeEmployee('4821', { id: 'emp-other' });
    const employees = { find: jest.fn().mockResolvedValue([other]) };
    const service = serviceWith(employees, {});
    await expect(
      service.createEmployee({ firstName: 'Sami', lastName: 'X', phone: '20000000', pin: '4821', hourlyRateMinor: 6000 }),
    ).rejects.toThrow('déjà utilisé');
  });

  it('allows creating an employee with a PIN no active employee currently holds', async () => {
    const other = await fakeEmployee('4821', { id: 'emp-other' });
    const employees = {
      find: jest.fn().mockResolvedValue([other]),
      create: jest.fn().mockResolvedValue({ id: 'emp-new', firstName: 'Sami' }),
    };
    const service = serviceWith(employees, {});
    const result = await service.createEmployee({ firstName: 'Sami', lastName: 'X', phone: '20000000', pin: '1111', hourlyRateMinor: 6000 });
    expect(result).toMatchObject({ id: 'emp-new' });
  });

  it('rejects a malformed PIN before ever touching the database', async () => {
    const employees = { find: jest.fn() };
    const service = serviceWith(employees, {});
    await expect(
      service.createEmployee({ firstName: 'Sami', lastName: 'X', phone: '20000000', pin: 'abcd', hourlyRateMinor: 6000 }),
    ).rejects.toThrow('4 à 6 chiffres');
    expect(employees.find).not.toHaveBeenCalled();
  });

  it('resetPin excludes the employee\'s own current PIN from the uniqueness check', async () => {
    const self = await fakeEmployee('4821', { id: 'emp-1', save: jest.fn().mockResolvedValue(undefined) });
    const employees = {
      find: jest.fn().mockResolvedValue([]), // self excluded via {_id: {$ne: id}} — simulated as empty result
      findById: jest.fn().mockResolvedValue(self),
    };
    const service = serviceWith(employees, {});
    await service.resetPin('emp-1', '4821'); // resetting to the SAME pin must not conflict with itself
    expect(employees.find).toHaveBeenCalledWith({ active: true, _id: { $ne: 'emp-1' } });
  });
});

describe('AttendanceService.clockIn', () => {
  it('creates a session when none is open', async () => {
    const created = fakeSession();
    const employees = {};
    const sessions = {
      findOne: jest.fn().mockReturnValue({ session: jest.fn().mockResolvedValue(null) }),
      create: jest.fn().mockResolvedValue([created]),
    };
    const service = serviceWith(employees, sessions);
    const result = await service.clockIn('emp-1', 'kiosk-1');
    expect(result).toBe(created);
    expect(sessions.create).toHaveBeenCalledWith(
      [expect.objectContaining({ employeeId: 'emp-1', status: 'OPEN', source: 'kiosk-1' })],
      expect.anything(),
    );
  });

  it('rejects a second clock-in while a session is already open', async () => {
    const existing = fakeSession();
    const sessions = {
      findOne: jest.fn().mockReturnValue({ session: jest.fn().mockResolvedValue(existing) }),
      create: jest.fn(),
    };
    const service = serviceWith({}, sessions);
    await expect(service.clockIn('emp-1')).rejects.toThrow('Une session est déjà ouverte');
    expect(sessions.create).not.toHaveBeenCalled();
  });

  it('a duplicate-key race (double-tap) is treated as an idempotent retry, not an error', async () => {
    const existing = fakeSession();
    const duplicateKeyError = Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
    const sessions = {
      findOne: jest
        .fn()
        .mockReturnValueOnce({ session: jest.fn().mockResolvedValue(null) }) // inside the (failing) transaction
        .mockResolvedValueOnce(existing), // the post-catch lookup for the winning session
      create: jest.fn().mockRejectedValue(duplicateKeyError),
    };
    const service = serviceWith({}, sessions);
    const result = await service.clockIn('emp-1');
    expect(result).toBe(existing);
  });
});

describe('AttendanceService.listActive', () => {
  it('returns open sessions with employee names resolved, oldest first', async () => {
    const openSession = { employeeId: 'emp-1', clockIn: new Date('2026-01-15T08:00:00.000Z') };
    const employees = { find: jest.fn().mockResolvedValue([{ id: 'emp-1', firstName: 'Ahmed', lastName: 'Ben Ali' }]) };
    const sessions = { find: jest.fn().mockReturnValue({ sort: jest.fn().mockResolvedValue([openSession]) }) };
    const service = serviceWith(employees, sessions);
    const result = await service.listActive();
    expect(result).toEqual([{ employeeId: 'emp-1', firstName: 'Ahmed', lastName: 'Ben Ali', clockIn: '2026-01-15T08:00:00.000Z' }]);
  });

  it('returns an empty list when nobody is clocked in', async () => {
    const sessions = { find: jest.fn().mockReturnValue({ sort: jest.fn().mockResolvedValue([]) }) };
    const service = serviceWith({}, sessions);
    expect(await service.listActive()).toEqual([]);
  });
});

describe('AttendanceService.clockOut', () => {
  it('closes the open session and computes duration in whole minutes', async () => {
    const open = fakeSession({
      clockIn: new Date('2026-01-15T08:00:00.000Z'),
      status: 'OPEN',
    });
    const sessions = { findOne: jest.fn().mockReturnValue({ session: jest.fn().mockResolvedValue(open) }) };
    const service = serviceWith({}, sessions);
    jest.useFakeTimers().setSystemTime(new Date('2026-01-15T12:30:00.000Z'));
    const result = await service.clockOut('emp-1');
    jest.useRealTimers();
    expect(result.status).toBe('CLOSED');
    expect(result.durationMinutes).toBe(270); // 4h30
    expect(open.save).toHaveBeenCalled();
  });

  it('rejects a clock-out with no open session and no recent closed one', async () => {
    const sessions = {
      findOne: jest
        .fn()
        .mockReturnValueOnce({ session: jest.fn().mockResolvedValue(null) }) // no OPEN session
        .mockReturnValueOnce({
          sort: jest.fn().mockReturnValue({ session: jest.fn().mockResolvedValue(null) }),
        }), // no recently-closed session either
    };
    const service = serviceWith({}, sessions);
    await expect(service.clockOut('emp-1')).rejects.toThrow('Aucune session ouverte');
  });

  it('a duplicate clock-out request within the retry window returns the just-closed session instead of erroring', async () => {
    const justClosed = fakeSession({ status: 'CLOSED', clockOut: new Date(Date.now() - 2000) });
    const sessions = {
      findOne: jest
        .fn()
        .mockReturnValueOnce({ session: jest.fn().mockResolvedValue(null) }) // no OPEN session — already closed by the first call
        .mockReturnValueOnce({ sort: jest.fn().mockReturnValue({ session: jest.fn().mockResolvedValue(justClosed) }) }),
    };
    const service = serviceWith({}, sessions);
    const result = await service.clockOut('emp-1');
    expect(result).toBe(justClosed);
  });
});
