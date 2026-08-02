import { computeOrderTotals, computeStockDeltas } from './order-calc';

describe('computeOrderTotals', () => {
  it('sums item lines and adds shipping', () => {
    const totals = computeOrderTotals([{ unitPriceMinor: 19900, qty: 2 }], 8000, 0);
    expect(totals.subtotalMinor).toBe(39800);
    expect(totals.totalMinor).toBe(47800);
  });

  it('applies a discount before adding shipping', () => {
    const totals = computeOrderTotals([{ unitPriceMinor: 100000, qty: 1 }], 8000, 10000);
    expect(totals).toEqual({ subtotalMinor: 100000, discountMinor: 10000, shippingMinor: 8000, totalMinor: 98000 });
  });

  it('clamps a discount larger than the subtotal', () => {
    const totals = computeOrderTotals([{ unitPriceMinor: 50000, qty: 1 }], 8000, 999000);
    expect(totals.discountMinor).toBe(50000);
    expect(totals.totalMinor).toBe(8000);
  });

  it('handles multiple line items with different quantities', () => {
    const totals = computeOrderTotals(
      [
        { unitPriceMinor: 19900, qty: 2 },
        { unitPriceMinor: 8000, qty: 3 },
      ],
      8000,
      0,
    );
    expect(totals.subtotalMinor).toBe(19900 * 2 + 8000 * 3);
  });

  it('returns zero totals for an empty cart', () => {
    expect(computeOrderTotals([], 0, 0)).toEqual({
      subtotalMinor: 0, discountMinor: 0, shippingMinor: 0, totalMinor: 0,
    });
  });
});

describe('computeStockDeltas', () => {
  it('returns a positive delta when a confirmed order quantity is increased', () => {
    const deltas = computeStockDeltas([{ productId: 'p1', qty: 2 }], [{ productId: 'p1', qty: 5 }]);
    expect(deltas.get('p1')).toBe(3);
  });

  it('returns a negative delta when a confirmed order quantity is reduced', () => {
    const deltas = computeStockDeltas([{ productId: 'p1', qty: 5 }], [{ productId: 'p1', qty: 2 }]);
    expect(deltas.get('p1')).toBe(-3);
  });

  it('omits products whose quantity is unchanged', () => {
    const deltas = computeStockDeltas([{ productId: 'p1', qty: 3 }], [{ productId: 'p1', qty: 3 }]);
    expect(deltas.has('p1')).toBe(false);
  });

  it('treats a removed product as a full negative delta (restore everything)', () => {
    const deltas = computeStockDeltas([{ productId: 'p1', qty: 4 }], []);
    expect(deltas.get('p1')).toBe(-4);
  });

  it('treats a newly added product as a full positive delta (deduct everything)', () => {
    const deltas = computeStockDeltas([], [{ productId: 'p1', qty: 4 }]);
    expect(deltas.get('p1')).toBe(4);
  });

  it('handles multiple products independently in the same edit', () => {
    const deltas = computeStockDeltas(
      [{ productId: 'p1', qty: 2 }, { productId: 'p2', qty: 10 }],
      [{ productId: 'p1', qty: 6 }, { productId: 'p2', qty: 7 }, { productId: 'p3', qty: 1 }],
    );
    expect(deltas.get('p1')).toBe(4);
    expect(deltas.get('p2')).toBe(-3);
    expect(deltas.get('p3')).toBe(1);
  });

  it('sums duplicate lines for the same product before diffing (bundle slots)', () => {
    const deltas = computeStockDeltas(
      [{ productId: 'p1', qty: 1 }, { productId: 'p1', qty: 1 }],
      [{ productId: 'p1', qty: 3 }],
    );
    expect(deltas.get('p1')).toBe(1); // before total 2, after total 3
  });
});
