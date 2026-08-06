import { PosSessionsService } from './pos-sessions.service';
import { PosTerminalsService } from './pos-terminals.service';

describe('POS authentication/business-session isolation', () => {
  it('keeps an OPEN cashier session queryable independently of access-token age', async () => {
    const openSession = { id: 'cash-session-1', status: 'OPEN', openedAt: new Date(0) };
    const sessionsModel = { findOne: jest.fn().mockResolvedValue(openSession) };
    const service = new PosSessionsService(sessionsModel as never, {} as never, {} as never);

    await expect(service.getOpenForTerminal('terminal-1')).resolves.toBe(openSession);
    expect(sessionsModel.findOne).toHaveBeenCalledWith({ terminalId: 'terminal-1', status: 'OPEN' });
  });

  // No pairing code, no admin approval step: the till just needs a valid
  // employee login (JwtAuthGuard, unaffected by any of this) to be usable.
  // A revoked or fingerprint-mismatched terminal record self-heals instead
  // of locking the till out, so a browser storage reset or a previous
  // admin revoke can never turn into a dead-end "terminal unpaired" screen.
  it('self-heals a revoked terminal instead of rejecting it', async () => {
    const revoked = { active: false, deviceFingerprint: 'old-device', save: jest.fn() };
    const model = { findOne: jest.fn().mockResolvedValue(revoked), create: jest.fn() };
    const service = new PosTerminalsService(model as never);

    const result = await service.validate('POS-1', 'device-1');

    expect(result).toBe(revoked);
    expect(revoked.active).toBe(true);
    expect(revoked.deviceFingerprint).toBe('device-1');
    expect(revoked.save).toHaveBeenCalled();
    expect(model.create).not.toHaveBeenCalled();
  });

  it('auto-provisions a brand-new terminal record on first sight of a code', async () => {
    const created = { active: true, deviceFingerprint: 'device-1', save: jest.fn() };
    const model = { findOne: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue(created) };
    const service = new PosTerminalsService(model as never);

    const result = await service.validate('POS-NEW', 'device-1');

    expect(result).toBe(created);
    expect(model.create).toHaveBeenCalledWith(expect.objectContaining({
      terminalCode: 'POS-NEW',
      active: true,
      deviceFingerprint: 'device-1',
    }));
  });
});
