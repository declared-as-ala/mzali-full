import { resolvePurchasePriceSource } from './purchase-price-resolution';

describe('resolvePurchasePriceSource', () => {
  it('prefers averageCostMinor when present', () => {
    const result = resolvePurchasePriceSource(
      { averageCostMinor: 16014, lastPurchaseCostMinor: 55000 },
      { purchasePriceMinor: 99000 },
    );
    expect(result).toEqual({ priceMinor: 16014, source: 'average' });
  });

  it('falls back to lastPurchaseCostMinor when average is unset', () => {
    const result = resolvePurchasePriceSource(
      { averageCostMinor: null, lastPurchaseCostMinor: 55000 },
      { purchasePriceMinor: 99000 },
    );
    expect(result).toEqual({ priceMinor: 55000, source: 'last' });
  });

  it('falls back to the supplier offer when neither legacy cost field is set', () => {
    const result = resolvePurchasePriceSource(
      { averageCostMinor: null, lastPurchaseCostMinor: null },
      { purchasePriceMinor: 15500 },
    );
    expect(result).toEqual({ priceMinor: 15500, source: 'offer' });
  });

  it('returns null (logged as unresolved, never a fabricated zero) when nothing is available', () => {
    const result = resolvePurchasePriceSource({ averageCostMinor: null, lastPurchaseCostMinor: null }, null);
    expect(result).toBeNull();
  });

  it('never overwrites — resolution is only ever consulted by the caller for variants with purchasePriceMinor already null, so re-running is a no-op for already-migrated variants', () => {
    // This test documents the idempotency contract: the command only calls
    // resolvePurchasePriceSource for variants matching { purchasePriceMinor: null },
    // so a variant already migrated (or manually priced) is never re-queried,
    // and the function itself has no notion of "already set" to violate.
    const result = resolvePurchasePriceSource({ averageCostMinor: 1000, lastPurchaseCostMinor: null }, null);
    expect(result).toEqual({ priceMinor: 1000, source: 'average' });
    // Calling again with the same (immutable) inputs yields the identical result.
    expect(resolvePurchasePriceSource({ averageCostMinor: 1000, lastPurchaseCostMinor: null }, null)).toEqual(result);
  });
});
