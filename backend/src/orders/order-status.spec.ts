import { ALLOWED_FOR_EMPLOYEE, planStockTransition, stockEffectForStatus } from './order-status';

describe('stockEffectForStatus', () => {
  it('treats checkout-draft as having no stock effect', () => {
    expect(stockEffectForStatus('checkout-draft')).toBe('none');
  });

  it('treats confirme/completed as committed', () => {
    expect(stockEffectForStatus('confirme')).toBe('commit');
    expect(stockEffectForStatus('completed')).toBe('commit');
  });

  it('treats annule/cancelled as released', () => {
    expect(stockEffectForStatus('annule')).toBe('release');
    expect(stockEffectForStatus('cancelled')).toBe('release');
  });

  it('treats every other status (including en-attente, awaiting phone confirmation) as having no stock effect', () => {
    for (const s of ['en-attente', 'pending', 'processing', 'on-hold', 'tentative']) {
      expect(stockEffectForStatus(s)).toBe('none');
    }
  });
});

describe('planStockTransition', () => {
  it('reserves when leaving draft to a holding status', () => {
    expect(planStockTransition('none', 'reserve')).toBe('reserve');
  });

  it('reserves+commits when a draft is directly confirmed', () => {
    expect(planStockTransition('none', 'commit')).toBe('commit');
  });

  it('commits when a reserved order is confirmed', () => {
    expect(planStockTransition('reserve', 'commit')).toBe('commit');
  });

  it('releases when a reserved order is cancelled', () => {
    expect(planStockTransition('reserve', 'release')).toBe('release');
  });

  it('restocks when a committed order is cancelled after confirmation', () => {
    expect(planStockTransition('commit', 'release')).toBe('restock');
  });

  it('does nothing when the effect does not change', () => {
    expect(planStockTransition('reserve', 'reserve')).toBe('none');
    expect(planStockTransition('commit', 'commit')).toBe('none');
  });

  it('does nothing for edge-case reversals never exercised by the legacy system', () => {
    expect(planStockTransition('commit', 'reserve')).toBe('none');
    expect(planStockTransition('release', 'reserve')).toBe('none');
  });
});

describe('ALLOWED_FOR_EMPLOYEE (ported verbatim)', () => {
  it('matches the exact set from the legacy route', () => {
    expect([...ALLOWED_FOR_EMPLOYEE].sort()).toEqual(
      [
        'pending', 'en-attente',
        'processing', 'confirme',
        'on-hold', 'tentative',
        'completed',
        'cancelled', 'annule',
      ].sort(),
    );
  });
});
