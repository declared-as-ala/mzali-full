import { computeMarginRow, extrapolateCost, isRevenueOrderStatus, isRevenuePosStatus, ORDER_REVENUE_STATUSES } from './margin-calc';

describe('extrapolateCost', () => {
  it('multiplies quantity sold by the purchase price', () => {
    expect(extrapolateCost(5, 2000)).toEqual({ costMinor: 10000, missing: false });
  });

  it('flags missing when purchase price is null, without assuming zero cost', () => {
    expect(extrapolateCost(5, null)).toEqual({ costMinor: 0, missing: true });
  });

  it('handles zero quantity', () => {
    expect(extrapolateCost(0, 2000)).toEqual({ costMinor: 0, missing: false });
  });
});

describe('computeMarginRow', () => {
  it('computes total purchase cost, profit, and margin percent from summed revenue/cost', () => {
    // 15505 DT revenue, 7094.202 DT cost -> matches the real "djin" product
    // sanity-checked against live data during the supplier-management rework.
    const result = computeMarginRow({ revenueMinor: 15_505_000, totalPurchaseCostMinor: 7_094_202, purchasePriceMissing: false });
    expect(result.totalPurchaseCostMinor).toBe(7_094_202);
    expect(result.profitMinor).toBe(15_505_000 - 7_094_202);
    expect(result.marginPercent).toBeCloseTo(54.2, 1);
    expect(result.purchasePriceMissing).toBe(false);
  });

  it('never fabricates a margin when purchase price is missing — no false 0% or 100%', () => {
    const result = computeMarginRow({ revenueMinor: 100_000, totalPurchaseCostMinor: 0, purchasePriceMissing: true });
    expect(result.totalPurchaseCostMinor).toBeNull();
    expect(result.profitMinor).toBeNull();
    expect(result.marginPercent).toBeNull();
    expect(result.purchasePriceMissing).toBe(true);
  });

  it('reports 100% margin only when cost is genuinely zero (not missing)', () => {
    const result = computeMarginRow({ revenueMinor: 100_000, totalPurchaseCostMinor: 0, purchasePriceMissing: false });
    expect(result.marginPercent).toBe(100);
  });

  it('reports negative profit and margin when sold below cost', () => {
    const result = computeMarginRow({ revenueMinor: 50_000, totalPurchaseCostMinor: 80_000, purchasePriceMissing: false });
    expect(result.profitMinor).toBe(-30_000);
    expect(result.marginPercent).toBeCloseTo(-60, 1);
  });

  it('returns null margin percent (not divide-by-zero) when revenue is zero', () => {
    const result = computeMarginRow({ revenueMinor: 0, totalPurchaseCostMinor: 0, purchasePriceMissing: false });
    expect(result.marginPercent).toBeNull();
  });
});

describe('isRevenueOrderStatus', () => {
  it('includes confirme and completed', () => {
    expect(isRevenueOrderStatus('confirme')).toBe(true);
    expect(isRevenueOrderStatus('completed')).toBe(true);
  });

  it('excludes pending, draft, and cancelled orders', () => {
    expect(isRevenueOrderStatus('en-attente')).toBe(false);
    expect(isRevenueOrderStatus('checkout-draft')).toBe(false);
    expect(isRevenueOrderStatus('annule')).toBe(false);
    expect(isRevenueOrderStatus('cancelled')).toBe(false);
    expect(isRevenueOrderStatus('tentative')).toBe(false);
  });

  it('the exported status list is exactly the two revenue statuses', () => {
    expect(ORDER_REVENUE_STATUSES).toEqual(['confirme', 'completed']);
  });
});

describe('isRevenuePosStatus', () => {
  it('only COMPLETED counts as revenue', () => {
    expect(isRevenuePosStatus('COMPLETED')).toBe(true);
  });

  it('excludes suspended (still open), cancelled, and refunded sales', () => {
    expect(isRevenuePosStatus('SUSPENDED')).toBe(false);
    expect(isRevenuePosStatus('CANCELLED')).toBe(false);
    expect(isRevenuePosStatus('REFUNDED')).toBe(false);
  });
});
