// Backend-only contract (not mirrored from frontend types/) — the
// "Chiffre d'affaires commandes" page, see backend/src/delivery-revenue/.

export type DeliveryRevenuePreset = 'today' | 'yesterday' | 'thisWeek' | 'thisMonth' | 'lastMonth' | 'thisYear' | 'custom';

export type DeliveryRevenueSummary = {
  /** Sum of every delivered order's total in range, regardless of a later return. */
  grossRevenueMinor: number;
  /** Sum of delivered-then-returned orders' totals in range — see the
   *  delivery-revenue module doc for why "returned" here means the
   *  existing `status: 'retourne'` workflow, not a separate flag. */
  returnsRevenueMinor: number;
  netRevenueMinor: number;
  deliveredCount: number;
  returnedCount: number;
  averageBasketMinor: number;
  /** Secondary breakdown — see #10: product revenue vs. delivery fees,
   *  both already persisted on each order, summed here without
   *  recomputing any pricing. */
  productRevenueMinor: number;
  shippingRevenueMinor: number;
};

export type DeliveryRevenueDayRow = {
  date: string; // YYYY-MM-DD, Africa/Tunis, derived from deliveredAt
  deliveredCount: number;
  revenueMinor: number;
};

/** 'manual' groups admin-confirmed deliveries (see #12) that have no
 *  carrier attached — always a small bucket, shown for transparency
 *  rather than silently folded into one of the real carriers. */
export type DeliveryRevenueProviderKey = 'navex' | 'firstdelivery' | 'axess' | 'manual';

export type DeliveryRevenueProviderRow = {
  provider: DeliveryRevenueProviderKey;
  deliveredCount: number;
  revenueMinor: number;
};

export type DeliveryRevenueOrderRow = {
  id: string;
  orderNumber: number;
  customerName: string;
  phone: string;
  provider: DeliveryRevenueProviderKey;
  tracking: string | null;
  deliveredAt: string;
  totalMinor: number;
  returned: boolean;
  manual: boolean;
};
