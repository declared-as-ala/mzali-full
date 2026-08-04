/**
 * Single source of truth for quantity-offer ("bundle") pricing — shared by
 * the online checkout (orders.service.ts, one explicit bundle chosen by the
 * shopper) and the POS till (pos-sales.service.ts, automatic best-price
 * combination as quantity changes). Pure/DB-free like order-calc.ts, so it's
 * unit-testable without mongodb-memory-server and callable identically from
 * both call sites — never duplicate this math elsewhere.
 */

export type ProductBundleLike = {
  id: string;
  name: string;
  label: string | null;
  priceMinor: number;
  regularPriceMinor: number;
  quantity: number;
};

/** One priced group within a plan — a run of `qty` units at a single
 *  per-unit price, either from an applied bundle or the regular price. */
export type PricingGroup = {
  qty: number;
  bundleId: string | null;
  bundleName: string | null;
  /** Total for this group at the offer (or regular) price. */
  totalMinor: number;
  /** What this group would have cost at the plain regular unit price. */
  regularTotalMinor: number;
};

export type PricingPlan = {
  groups: PricingGroup[];
  totalMinor: number;
  regularTotalMinor: number;
  savingsMinor: number;
};

/**
 * Price one explicit bundle selection (the storefront's current UX: the
 * shopper picks exactly one labeled offer, e.g. "2 pulls — 45 DT"). Matches
 * orders.service.ts's resolveLines() math exactly — extracted here so both
 * call sites share the identical rounding behavior.
 */
export function priceExplicitBundle(bundle: ProductBundleLike): PricingGroup {
  const qty = Math.max(1, bundle.quantity);
  return {
    qty,
    bundleId: bundle.id,
    bundleName: bundle.name,
    totalMinor: bundle.priceMinor,
    regularTotalMinor: bundle.regularPriceMinor > 0 ? bundle.regularPriceMinor : bundle.priceMinor,
  };
}

/**
 * Automatic best-combination pricing for a target quantity of the same
 * product (the POS's UX: cashier keys in a quantity, no offer picked by
 * hand). Finds the price-minimizing combination of the product's configured
 * bundle sizes (each usable any number of times) plus regular-priced
 * leftover units — true optimum via bottom-up DP, not a greedy
 * largest-first heuristic, so it's correct even when bundle prices don't
 * scale proportionally with size (e.g. 3-for-60 can beat 2-for-45 + 1
 * regular for some quantities and lose for others).
 *
 * Only bundles with quantity >= 2 participate — a "bundle" of quantity 1
 * is just a price override, not a quantity offer, and mixing it in would
 * let it silently replace the regular price for every single unit.
 */
export function priceBestCombination(
  qty: number,
  regularUnitPriceMinor: number,
  bundles: ProductBundleLike[],
): PricingPlan {
  const n = Math.max(0, Math.round(qty));
  const offers = bundles.filter((b) => b.quantity >= 2 && b.priceMinor >= 0);

  if (n === 0) {
    return { groups: [], totalMinor: 0, regularTotalMinor: 0, savingsMinor: 0 };
  }

  // best[k] = cheapest total price for exactly k units, using any mix of
  // offers plus regular-priced units; choice[k] = the group applied last to
  // reach k (either a bundle, or a single regular-priced unit), so the plan
  // can be reconstructed by walking choices backward from n.
  const best = new Array<number>(n + 1).fill(Infinity);
  const choice = new Array<ProductBundleLike | null>(n + 1).fill(null);
  best[0] = 0;

  for (let k = 1; k <= n; k++) {
    // Option: one regular-priced unit on top of the best solution for k-1.
    if (best[k - 1] + regularUnitPriceMinor < best[k]) {
      best[k] = best[k - 1] + regularUnitPriceMinor;
      choice[k] = null;
    }
    // Option: apply a bundle of size b.quantity on top of best[k - b.quantity].
    for (const b of offers) {
      const prev = k - b.quantity;
      if (prev < 0) continue;
      const candidate = best[prev] + b.priceMinor;
      if (candidate < best[k]) {
        best[k] = candidate;
        choice[k] = b;
      }
    }
  }

  // Reconstruct the plan, then merge adjacent groups of the same kind
  // (e.g. the 2-bundle applied twice for qty 4) into one group each.
  type RawStep = { qty: number; bundle: ProductBundleLike | null };
  const steps: RawStep[] = [];
  let k = n;
  while (k > 0) {
    const b = choice[k];
    if (b) {
      steps.push({ qty: b.quantity, bundle: b });
      k -= b.quantity;
    } else {
      steps.push({ qty: 1, bundle: null });
      k -= 1;
    }
  }
  steps.reverse();

  const groups: PricingGroup[] = [];
  for (const step of steps) {
    const last = groups[groups.length - 1];
    const key = step.bundle?.id ?? null;
    if (last && last.bundleId === key) {
      last.qty += step.qty;
      last.totalMinor += step.bundle ? step.bundle.priceMinor : regularUnitPriceMinor;
      last.regularTotalMinor += step.qty * regularUnitPriceMinor;
    } else {
      groups.push({
        qty: step.qty,
        bundleId: key,
        bundleName: step.bundle?.name ?? null,
        totalMinor: step.bundle ? step.bundle.priceMinor : regularUnitPriceMinor,
        regularTotalMinor: step.qty * regularUnitPriceMinor,
      });
    }
  }

  const totalMinor = groups.reduce((s, g) => s + g.totalMinor, 0);
  const regularTotalMinor = n * regularUnitPriceMinor;
  return { groups, totalMinor, regularTotalMinor, savingsMinor: regularTotalMinor - totalMinor };
}

export type BundleUnit = {
  /** Opaque key identifying which physical line/variant this unit came
   *  from (e.g. a variantId) — units are only ever merged back together
   *  when they share both this key AND the same pricing outcome. */
  unitKey: string;
};

export type PricedUnitRun<T extends BundleUnit> = {
  unitKey: string;
  units: T[];
  qty: number;
  unitPriceMinor: number;
  regularUnitPriceMinor: number;
  bundleId: string | null;
  bundleName: string | null;
  lineTotalMinor: number;
  regularTotalMinor: number;
};

/**
 * Splits a PricingPlan's per-group totals down to integer per-unit prices
 * (largest-remainder rounding — the per-unit prices always sum back to
 * exactly the group's totalMinor, never off by a millime) and zips them
 * against an ordered list of physical units (e.g. one entry per variant
 * requested in a bundle group). Consecutive units are merged into one run
 * only when they share both the same unitKey (same variant) and landed in
 * the same pricing group — this is what turns "2 different sizes bought
 * under one 2-for-45 offer" into two separate priced PosSaleLine-shaped
 * records that still carry the same bundleId for the receipt/cart to group
 * visually, while "same variant, qty bumped to 3 with only a 2-item offer
 * configured" correctly splits into a 2-at-offer-price run and a
 * 1-at-regular-price run for that same variant.
 */
export function distributeGroupPricing<T extends BundleUnit>(units: T[], plan: PricingPlan, regularUnitPriceMinor: number): PricedUnitRun<T>[] {
  if (units.length !== plan.groups.reduce((s, g) => s + g.qty, 0)) {
    throw new Error('distributeGroupPricing: unit count does not match plan quantity');
  }

  const runs: PricedUnitRun<T>[] = [];
  let unitIndex = 0;
  for (const group of plan.groups) {
    const base = Math.floor(group.totalMinor / group.qty);
    const remainder = group.totalMinor - base * group.qty;
    for (let i = 0; i < group.qty; i++) {
      const unit = units[unitIndex++];
      const unitPriceMinor = base + (i < remainder ? 1 : 0);
      const last = runs[runs.length - 1];
      if (last && last.unitKey === unit.unitKey && last.bundleId === group.bundleId) {
        last.units.push(unit);
        last.qty += 1;
        last.unitPriceMinor = Math.round((last.lineTotalMinor + unitPriceMinor) / last.qty);
        last.lineTotalMinor += unitPriceMinor;
        last.regularTotalMinor += regularUnitPriceMinor;
      } else {
        runs.push({
          unitKey: unit.unitKey,
          units: [unit],
          qty: 1,
          unitPriceMinor,
          regularUnitPriceMinor,
          bundleId: group.bundleId,
          bundleName: group.bundleName,
          lineTotalMinor: unitPriceMinor,
          regularTotalMinor: regularUnitPriceMinor,
        });
      }
    }
  }
  return runs;
}
