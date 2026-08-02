import { evaluateCoupon, CouponSnapshot } from './coupon-calc';

function baseCoupon(overrides: Partial<CouponSnapshot> = {}): CouponSnapshot {
  return {
    code: 'PROMO10',
    type: 'percent',
    value: 10,
    minSubtotalMinor: null,
    startsAt: null,
    endsAt: null,
    usageLimit: null,
    usageCount: 0,
    perPhoneLimit: null,
    active: true,
    ...overrides,
  };
}

const NOW = new Date('2026-07-17T12:00:00Z');
const ctx = (overrides: Partial<{ eligibleSubtotalMinor: number; phoneRedemptionCount: number }> = {}) => ({
  eligibleSubtotalMinor: 100000,
  now: NOW,
  phoneRedemptionCount: 0,
  ...overrides,
});

describe('evaluateCoupon', () => {
  it('computes a percent discount', () => {
    const r = evaluateCoupon(baseCoupon({ value: 10 }), ctx({ eligibleSubtotalMinor: 100000 }));
    expect(r).toEqual({ valid: true, discountMinor: 10000 });
  });

  it('computes a fixed discount', () => {
    const r = evaluateCoupon(baseCoupon({ type: 'fixed', value: 8000 }), ctx({ eligibleSubtotalMinor: 100000 }));
    expect(r).toEqual({ valid: true, discountMinor: 8000 });
  });

  it('clamps a fixed discount to the eligible subtotal', () => {
    const r = evaluateCoupon(baseCoupon({ type: 'fixed', value: 999000 }), ctx({ eligibleSubtotalMinor: 50000 }));
    expect(r).toEqual({ valid: true, discountMinor: 50000 });
  });

  it('rejects an inactive coupon', () => {
    const r = evaluateCoupon(baseCoupon({ active: false }), ctx());
    expect(r.valid).toBe(false);
  });

  it('rejects before startsAt', () => {
    const r = evaluateCoupon(baseCoupon({ startsAt: new Date('2026-08-01') }), ctx());
    expect(r.valid).toBe(false);
  });

  it('rejects after endsAt', () => {
    const r = evaluateCoupon(baseCoupon({ endsAt: new Date('2026-01-01') }), ctx());
    expect(r.valid).toBe(false);
  });

  it('rejects when the global usage limit is reached', () => {
    const r = evaluateCoupon(baseCoupon({ usageLimit: 5, usageCount: 5 }), ctx());
    expect(r.valid).toBe(false);
  });

  it('allows usage right up to (but not past) the limit', () => {
    const r = evaluateCoupon(baseCoupon({ usageLimit: 5, usageCount: 4 }), ctx());
    expect(r.valid).toBe(true);
  });

  it('rejects when the per-phone limit is reached', () => {
    const r = evaluateCoupon(baseCoupon({ perPhoneLimit: 1 }), ctx({ phoneRedemptionCount: 1 }));
    expect(r.valid).toBe(false);
  });

  it('rejects when the minimum subtotal is not met', () => {
    const r = evaluateCoupon(baseCoupon({ minSubtotalMinor: 200000 }), ctx({ eligibleSubtotalMinor: 100000 }));
    expect(r.valid).toBe(false);
  });

  it('rejects when nothing in the cart is eligible', () => {
    const r = evaluateCoupon(baseCoupon(), ctx({ eligibleSubtotalMinor: 0 }));
    expect(r.valid).toBe(false);
  });
});
