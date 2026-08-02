/**
 * Pure margin-calculation core, extracted out of stats.service.ts's
 * marginReport() so it's unit-testable without mongodb-memory-server (same
 * convention as pos/pos-sale-calc.ts). Revenue is always the REAL summed
 * transacted amount from sale/order line snapshots (never recomputed from
 * the product's current selling price — a price change after the sale must
 * not retroactively change historical revenue). Cost is the one thing that
 * IS extrapolated from a current value (purchasePriceMinor × historical
 * quantity), because no per-sale cost snapshot is recorded anywhere.
 *
 * Split in two because cost extrapolation happens per-variant (a single
 * purchasePriceMinor genuinely applies there) while profit/margin% must be
 * computed once per product from the *summed* revenue and cost across all
 * of that product's variants — margin percent isn't additive, so it can't
 * be computed per-variant and then combined.
 */

/** Per-variant: quantity sold × that variant's purchase price. */
export function extrapolateCost(quantitySold: number, purchasePriceMinor: number | null): { costMinor: number; missing: boolean } {
  if (purchasePriceMinor == null) return { costMinor: 0, missing: true };
  return { costMinor: purchasePriceMinor * quantitySold, missing: false };
}

export type MarginCalcInput = {
  revenueMinor: number;
  totalPurchaseCostMinor: number;
  purchasePriceMissing: boolean;
};

export type MarginCalcResult = {
  totalPurchaseCostMinor: number | null;
  profitMinor: number | null;
  marginPercent: number | null;
  purchasePriceMissing: boolean;
};

/** Product-level: revenue minus the (already-summed) purchase cost. Never
 *  assumes a zero cost — a missing purchase price yields null profit/margin,
 *  not a false 100% margin. */
export function computeMarginRow(input: MarginCalcInput): MarginCalcResult {
  if (input.purchasePriceMissing) {
    return { totalPurchaseCostMinor: null, profitMinor: null, marginPercent: null, purchasePriceMissing: true };
  }
  const profitMinor = input.revenueMinor - input.totalPurchaseCostMinor;
  const marginPercent = input.revenueMinor === 0 ? null : Math.round((profitMinor / input.revenueMinor) * 1000) / 10;
  return { totalPurchaseCostMinor: input.totalPurchaseCostMinor, profitMinor, marginPercent, purchasePriceMissing: false };
}

/** Matches the stock-commit semantics in orders/order-status.ts — an order
 *  isn't real revenue until it's confirmed by phone or completed, not just
 *  placed. Excludes pending ('en-attente'), draft, and cancelled orders. */
export const ORDER_REVENUE_STATUSES = ['confirme', 'completed'] as const;
export function isRevenueOrderStatus(status: string): boolean {
  return (ORDER_REVENUE_STATUSES as readonly string[]).includes(status);
}

/** Only a fully COMPLETED POS sale counts — SUSPENDED (still open),
 *  CANCELLED, and REFUNDED (whole-sale refund) are all excluded. Partial
 *  per-line refund quantities can't be subtracted: no refund-quantity field
 *  exists anywhere on PosSale/Order line items in this codebase. */
export function isRevenuePosStatus(status: string): boolean {
  return status === 'COMPLETED';
}
