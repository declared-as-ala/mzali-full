// Admin-only type for the new inventory feature (mzali-api provider only).
// Hand-kept in sync with backend/src/contracts/variant.ts (not enforced by
// check-contracts.mjs — same convention as types/inventory.ts).
export type Variant = {
  id: string;
  productId: string;
  sku: string;
  barcode: string | null;
  attributes: Record<string, string>;
  active: boolean;
  sellingPriceMinor: number | null;
  compareAtPriceMinor: number | null;
  lastPurchaseCostMinor: number | null;
  averageCostMinor: number | null;
  purchasePriceMinor: number | null;
  createdAt: string;
  updatedAt: string;
};
