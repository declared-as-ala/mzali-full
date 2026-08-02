/** Pure resolution logic for migrate:purchase-prices, extracted for unit
 *  testing without a live database. Given a variant's legacy cost fields
 *  and (optionally) its best-matching supplier offer, decides which value
 *  — if any — should seed the new `purchasePriceMinor` field, and from
 *  which source, without ever overwriting an already-set price (the caller
 *  only invokes this for variants where purchasePriceMinor is still null,
 *  which is what makes re-running the migration idempotent). */

export type PurchasePriceSource = 'average' | 'last' | 'offer';

export type VariantCostFields = {
  averageCostMinor: number | null;
  lastPurchaseCostMinor: number | null;
};

export type OfferCandidate = {
  purchasePriceMinor: number;
} | null;

export type PurchasePriceResolution = {
  priceMinor: number;
  source: PurchasePriceSource;
} | null;

export function resolvePurchasePriceSource(variant: VariantCostFields, bestOffer: OfferCandidate): PurchasePriceResolution {
  if (variant.averageCostMinor != null) {
    return { priceMinor: variant.averageCostMinor, source: 'average' };
  }
  if (variant.lastPurchaseCostMinor != null) {
    return { priceMinor: variant.lastPurchaseCostMinor, source: 'last' };
  }
  if (bestOffer != null) {
    return { priceMinor: bestOffer.purchasePriceMinor, source: 'offer' };
  }
  return null;
}
