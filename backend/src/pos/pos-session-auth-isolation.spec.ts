import { UnauthorizedException } from '@nestjs/common';
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

  it('rejects a revoked terminal and never silently reactivates it', async () => {
    const revoked = { active: false, deviceFingerprint: 'device-1', save: jest.fn() };
    const model = { findOne: jest.fn().mockResolvedValue(revoked) };
    const service = new PosTerminalsService(model as never);

    await expect(service.validate('POS-1', 'device-1')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(revoked.save).not.toHaveBeenCalled();
  });
});
