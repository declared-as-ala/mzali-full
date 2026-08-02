// Backend-only contract (not mirrored from frontend types/).

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

export type VariantStockLevel = {
  locationId: string;
  quantityOnHand: number;
  quantityReserved: number;
  quantityAvailable: number;
};
