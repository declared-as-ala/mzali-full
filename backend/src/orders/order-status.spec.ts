import {
  ALLOWED_FOR_EMPLOYEE,
  attemptStatus,
  getAttemptNumber,
  getOrderStatusLabel,
  isAttemptStatus,
  planStockTransition,
  stockEffectForStatus,
  TENTATIVE_STATUSES,
} from './order-status';

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

  it('treats every tentative-1..5 attempt status as having no stock effect', () => {
    for (const s of TENTATIVE_STATUSES) {
      expect(stockEffectForStatus(s)).toBe('none');
    }
  });
});

describe('attempt status helpers', () => {
  it('TENTATIVE_STATUSES is exactly tentative-1..tentative-5, in order', () => {
    expect(TENTATIVE_STATUSES).toEqual(['tentative-1', 'tentative-2', 'tentative-3', 'tentative-4', 'tentative-5']);
  });

  it('attemptStatus() builds and clamps the status string', () => {
    expect(attemptStatus(1)).toBe('tentative-1');
    expect(attemptStatus(5)).toBe('tentative-5');
    expect(attemptStatus(0)).toBe('tentative-1');
    expect(attemptStatus(-3)).toBe('tentative-1');
    expect(attemptStatus(9)).toBe('tentative-5');
  });

  it('isAttemptStatus() only matches tentative-1..5, not the legacy flat status', () => {
    expect(isAttemptStatus('tentative-1')).toBe(true);
    expect(isAttemptStatus('tentative-5')).toBe(true);
    expect(isAttemptStatus('tentative')).toBe(false);
    expect(isAttemptStatus('tentative-0')).toBe(false);
    expect(isAttemptStatus('tentative-6')).toBe(false);
    expect(isAttemptStatus('confirme')).toBe(false);
  });

  it('getAttemptNumber() extracts the number, or null for anything else', () => {
    expect(getAttemptNumber('tentative-3')).toBe(3);
    expect(getAttemptNumber('tentative')).toBeNull();
    expect(getAttemptNumber('confirme')).toBeNull();
    expect(getAttemptNumber('tentative-0')).toBeNull();
  });

  it('getOrderStatusLabel() renders "Tentative N" for attempt statuses and the French label otherwise', () => {
    expect(getOrderStatusLabel('tentative-4')).toBe('Tentative 4');
    expect(getOrderStatusLabel('en-attente')).toBe('En attente');
    expect(getOrderStatusLabel('confirme')).toBe('Confirmée');
    expect(getOrderStatusLabel('annule')).toBe('Annulée');
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

describe('ALLOWED_FOR_EMPLOYEE', () => {
  it('has the same shape as the legacy route, with tentative-1..5 instead of the flat tentative status', () => {
    expect([...ALLOWED_FOR_EMPLOYEE].sort()).toEqual(
      [
        'pending', 'en-attente',
        'processing', 'confirme',
        'on-hold', 'tentative-1', 'tentative-2', 'tentative-3', 'tentative-4', 'tentative-5',
        'completed',
        'cancelled', 'annule',
      ].sort(),
    );
  });

  it('no longer allows the legacy flat tentative status', () => {
    expect(ALLOWED_FOR_EMPLOYEE.has('tentative')).toBe(false);
  });
});
