import { computeSaleStockDeltas, sumByMethod } from './pos-sale-calc';

describe('computeSaleStockDeltas', () => {
  it('returns a positive delta when a line quantity is increased', () => {
    const deltas = computeSaleStockDeltas([{ variantId: 'v1', qty: 2 }], [{ variantId: 'v1', qty: 5 }]);
    expect(deltas.get('v1')).toBe(3);
  });

  it('returns a negative delta when a line quantity is reduced', () => {
    const deltas = computeSaleStockDeltas([{ variantId: 'v1', qty: 5 }], [{ variantId: 'v1', qty: 2 }]);
    expect(deltas.get('v1')).toBe(-3);
  });

  it('omits variants whose quantity is unchanged', () => {
    const deltas = computeSaleStockDeltas([{ variantId: 'v1', qty: 3 }], [{ variantId: 'v1', qty: 3 }]);
    expect(deltas.has('v1')).toBe(false);
  });

  it('treats a removed line as a full negative delta (restore everything)', () => {
    const deltas = computeSaleStockDeltas([{ variantId: 'v1', qty: 4 }], []);
    expect(deltas.get('v1')).toBe(-4);
  });

  it('treats a newly added line as a full positive delta (deduct everything)', () => {
    const deltas = computeSaleStockDeltas([], [{ variantId: 'v1', qty: 4 }]);
    expect(deltas.get('v1')).toBe(4);
  });

  it('handles multiple variants independently in the same edit', () => {
    const deltas = computeSaleStockDeltas(
      [{ variantId: 'v1', qty: 2 }, { variantId: 'v2', qty: 10 }],
      [{ variantId: 'v1', qty: 6 }, { variantId: 'v2', qty: 7 }, { variantId: 'v3', qty: 1 }],
    );
    expect(deltas.get('v1')).toBe(4);
    expect(deltas.get('v2')).toBe(-3);
    expect(deltas.get('v3')).toBe(1);
  });
});

describe('sumByMethod', () => {
  it('sums only rows matching the given method', () => {
    const rows = [
      { method: 'CASH', amountMinor: 1000 },
      { method: 'CARD', amountMinor: 2000 },
      { method: 'CASH', amountMinor: 500 },
    ];
    expect(sumByMethod(rows, 'CASH')).toBe(1500);
    expect(sumByMethod(rows, 'CARD')).toBe(2000);
    expect(sumByMethod(rows, 'OTHER')).toBe(0);
  });

  it('returns 0 for an empty list', () => {
    expect(sumByMethod([], 'CASH')).toBe(0);
  });
});
