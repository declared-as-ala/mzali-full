import { distributeGroupPricing, priceBestCombination, priceExplicitBundle, ProductBundleLike } from './product-pricing';

const bundle2for45: ProductBundleLike = {
  id: 'b2', name: '2 articles', label: null, priceMinor: 45000, regularPriceMinor: 50000, quantity: 2,
};
const bundle3for60: ProductBundleLike = {
  id: 'b3', name: '3 articles', label: null, priceMinor: 60000, regularPriceMinor: 75000, quantity: 3,
};
const REGULAR = 25000; // 25 DT

describe('priceBestCombination', () => {
  it('quantity 1 uses the regular price, no offer applied', () => {
    const plan = priceBestCombination(1, REGULAR, [bundle2for45]);
    expect(plan.groups).toEqual([{ qty: 1, bundleId: null, bundleName: null, totalMinor: REGULAR, regularTotalMinor: REGULAR }]);
    expect(plan.totalMinor).toBe(25000);
    expect(plan.savingsMinor).toBe(0);
  });

  it('quantity 2 applies the 2-item offer, not 2x regular', () => {
    const plan = priceBestCombination(2, REGULAR, [bundle2for45]);
    expect(plan.totalMinor).toBe(45000);
    expect(plan.groups).toEqual([{ qty: 2, bundleId: 'b2', bundleName: '2 articles', totalMinor: 45000, regularTotalMinor: 50000 }]);
    expect(plan.savingsMinor).toBe(5000);
  });

  it('quantity 3 combines the 2-item offer with one regular-priced unit (45 + 25 = 70)', () => {
    const plan = priceBestCombination(3, REGULAR, [bundle2for45]);
    expect(plan.totalMinor).toBe(70000);
    expect(plan.groups).toEqual([
      { qty: 2, bundleId: 'b2', bundleName: '2 articles', totalMinor: 45000, regularTotalMinor: 50000 },
      { qty: 1, bundleId: null, bundleName: null, totalMinor: 25000, regularTotalMinor: 25000 },
    ]);
  });

  it('quantity 4 applies the 2-item offer twice, merged into one group', () => {
    const plan = priceBestCombination(4, REGULAR, [bundle2for45]);
    expect(plan.totalMinor).toBe(90000);
    expect(plan.groups).toEqual([
      { qty: 4, bundleId: 'b2', bundleName: '2 articles', totalMinor: 90000, regularTotalMinor: 100000 },
    ]);
  });

  it('picks the true-optimal combination across multiple bundle sizes (qty 5: 3-bundle + 2-bundle beats 2+2+1)', () => {
    const plan = priceBestCombination(5, REGULAR, [bundle2for45, bundle3for60]);
    // 3+2 = 60+45 = 105 vs 2+2+1 = 45+45+25 = 115 vs regular x5 = 125
    expect(plan.totalMinor).toBe(105000);
  });

  it('a bundle with quantity 1 is ignored (not a quantity offer)', () => {
    const priceOverride: ProductBundleLike = { id: 'b1', name: 'solo', label: null, priceMinor: 1, regularPriceMinor: 1, quantity: 1 };
    const plan = priceBestCombination(2, REGULAR, [priceOverride]);
    expect(plan.totalMinor).toBe(50000); // falls back to 2x regular, priceOverride never applies
  });

  it('quantity 0 returns an empty plan', () => {
    const plan = priceBestCombination(0, REGULAR, [bundle2for45]);
    expect(plan.groups).toEqual([]);
    expect(plan.totalMinor).toBe(0);
  });

  it('no bundles configured falls back to regular price for every unit', () => {
    const plan = priceBestCombination(3, REGULAR, []);
    expect(plan.totalMinor).toBe(75000);
    expect(plan.groups).toEqual([{ qty: 3, bundleId: null, bundleName: null, totalMinor: 75000, regularTotalMinor: 75000 }]);
  });

  it('a worse-value bundle (priced above regular per-unit) is never chosen over plain regular pricing', () => {
    const badDeal: ProductBundleLike = { id: 'bad', name: 'bad', label: null, priceMinor: 99000, regularPriceMinor: 50000, quantity: 2 };
    const plan = priceBestCombination(2, REGULAR, [badDeal]);
    expect(plan.totalMinor).toBe(50000); // 2x regular (50000) beats the bad bundle (99000)
    expect(plan.groups[0].bundleId).toBeNull();
  });
});

describe('priceExplicitBundle', () => {
  it('prices a single explicit bundle selection at its configured total', () => {
    const group = priceExplicitBundle(bundle2for45);
    expect(group).toEqual({ qty: 2, bundleId: 'b2', bundleName: '2 articles', totalMinor: 45000, regularTotalMinor: 50000 });
  });

  it('falls back regularTotalMinor to the offer price when no regular price is configured', () => {
    const noRegular: ProductBundleLike = { id: 'b', name: 'x', label: null, priceMinor: 45000, regularPriceMinor: 0, quantity: 2 };
    const group = priceExplicitBundle(noRegular);
    expect(group.regularTotalMinor).toBe(45000);
  });

  it('clamps a zero/negative quantity to 1', () => {
    const zeroQty: ProductBundleLike = { id: 'b', name: 'x', label: null, priceMinor: 20000, regularPriceMinor: 25000, quantity: 0 };
    const group = priceExplicitBundle(zeroQty);
    expect(group.qty).toBe(1);
  });
});

describe('distributeGroupPricing', () => {
  it('two different variants under one bundle group split the offer price exactly (largest-remainder rounding)', () => {
    // 45000 / 2 = 22500 exactly — no rounding needed, sanity check first.
    const plan = priceBestCombination(2, REGULAR, [bundle2for45]);
    const units = [{ unitKey: 'variant-black-m' }, { unitKey: 'variant-white-xl' }];
    const runs = distributeGroupPricing(units, plan, REGULAR);
    expect(runs).toHaveLength(2);
    expect(runs[0]).toMatchObject({ unitKey: 'variant-black-m', qty: 1, unitPriceMinor: 22500, bundleId: 'b2', bundleName: '2 articles' });
    expect(runs[1]).toMatchObject({ unitKey: 'variant-white-xl', qty: 1, unitPriceMinor: 22500, bundleId: 'b2', bundleName: '2 articles' });
    expect(runs[0].lineTotalMinor + runs[1].lineTotalMinor).toBe(45000);
  });

  it('an odd offer price splits with the remainder going to the first unit(s), summing exactly', () => {
    const oddBundle: ProductBundleLike = { id: 'b2odd', name: '2 for 45.001', label: null, priceMinor: 45001, regularPriceMinor: 50000, quantity: 2 };
    const plan = priceBestCombination(2, REGULAR, [oddBundle]);
    const units = [{ unitKey: 'v1' }, { unitKey: 'v2' }];
    const runs = distributeGroupPricing(units, plan, REGULAR);
    const total = runs.reduce((s, r) => s + r.lineTotalMinor, 0);
    expect(total).toBe(45001); // never lose or gain a millime to rounding
    expect(runs.map((r) => r.unitPriceMinor).sort((a, b) => b - a)).toEqual([22501, 22500]);
  });

  it('the same variant spanning a bundle-price group and a regular-price group stays split into two runs', () => {
    // qty 3 with only a 2-for-45 offer: 2 at bundle price + 1 at regular —
    // all three units are the SAME variant, so this proves the split is
    // driven by pricing-group boundaries, not just by variant identity.
    const plan = priceBestCombination(3, REGULAR, [bundle2for45]);
    const units = [{ unitKey: 'same-variant' }, { unitKey: 'same-variant' }, { unitKey: 'same-variant' }];
    const runs = distributeGroupPricing(units, plan, REGULAR);
    expect(runs).toHaveLength(2);
    expect(runs[0]).toMatchObject({ qty: 2, bundleId: 'b2', lineTotalMinor: 45000 });
    expect(runs[1]).toMatchObject({ qty: 1, bundleId: null, lineTotalMinor: 25000 });
  });

  it('the same variant repeated within one pricing group merges into a single run', () => {
    const plan = priceBestCombination(4, REGULAR, [bundle2for45]); // one merged group, qty 4
    const units = [{ unitKey: 'v' }, { unitKey: 'v' }, { unitKey: 'v' }, { unitKey: 'v' }];
    const runs = distributeGroupPricing(units, plan, REGULAR);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ qty: 4, bundleId: 'b2', lineTotalMinor: 90000 });
  });

  it('throws when the unit list does not match the plan quantity — a caller bug, not silently mispriced', () => {
    const plan = priceBestCombination(2, REGULAR, [bundle2for45]);
    expect(() => distributeGroupPricing([{ unitKey: 'only-one' }], plan, REGULAR)).toThrow();
  });
});
