// Backend-only contract (not mirrored from frontend types/).
// Mirrors the shape persisted today in data/site-settings.json plus
// commerce settings that were previously hardcoded in the storefront.

export type SiteSettings = {
  photoUrl?: string;
  phones?: string[];
  whatsapp?: string;
  instagram?: string;
  tiktok?: string;
  facebook?: string;
};

export type CommerceSettings = {
  /** Flat shipping fee in dinars (previously hardcoded to 8 in the checkout page). */
  shippingFlat: number;
  /** Default status for new storefront orders. */
  defaultOrderStatus: string;
  /** Governorates offered in the checkout city dropdown. */
  cities: string[];
};

/**
 * Which location(s) count toward "can this be bought online" — see
 * docs/pos-platform/inventory-architecture.md §"Stock policy". Only
 * DEPOT_ONLY is exercised in production today; the others exist so the
 * policy can change later without touching every call site.
 */
export type StockPolicy = 'DEPOT_ONLY' | 'BOUTIQUE_ONLY' | 'COMBINED_LOCATIONS' | 'PRIORITY_LOCATIONS';

export type InventorySettings = {
  /** Master switch — when false ("mode sans stock") order edits never
   *  compute stock deltas or create stock movements; the order document
   *  itself still updates normally. Default true. */
  enabled: boolean;
  stockPolicy: StockPolicy;
  /** A stocktake line's |counted - expected| beyond this requires reasonIfLarge before it can be posted. */
  stocktakeVarianceThreshold: number;
};

/**
 * Fiscal fields are explicitly gated — see
 * docs/pos-platform/invoicing-and-quotes.md "Fiscal fields — explicit
 * gate". `enabled: false` (the default) blocks `invoices.finalize`
 * entirely; everything else (drafting, PDF preview) works regardless so
 * development isn't blocked on accountant sign-off. `tvaRatePercent`/
 * `timbreFiscalMinor` are placeholder defaults confirmed with the user
 * at Sprint 7 kickoff (19% standard TVA, 1.000 TND flat timbre fiscal) —
 * still configurable, not hardcoded into calculation logic.
 */
export type InvoicingSettings = {
  enabled: boolean;
  tvaRatePercent: number;
  timbreFiscalMinor: number;
  numberFormats: {
    quote: string;
    invoiceSales: string;
    invoicePos: string;
    invoiceOnline: string;
    invoiceProforma: string;
    creditNote: string;
  };
};

export type CompanySettings = {
  legalName: string;
  address: string;
  matriculeFiscal: string;
  rcNumber: string;
  phone: string;
  email: string;
  logoMediaId: string | null;
};

/**
 * Loyalty earning/redemption rules — see docs/pos-platform/loyalty-system.md
 * §"Earning rules" and §"Redemption". `pointValueMinor` (how many millimes
 * one point is worth when redeemed) isn't in the doc's original settings
 * shape but is required to convert points into a discount amount — added
 * as a configurable figure rather than a hardcoded constant, same approach
 * as Sprint 7's fiscal defaults.
 */
export type LoyaltySettings = {
  pointsPerDinarSpent: number;
  minimumPurchaseMinor: number;
  bonusCategories: { categoryId: string; multiplier: number }[];
  bonusProducts: { productId: string; multiplier: number }[];
  birthdayBonusPoints: number;
  newCustomerBonusPoints: number;
  earnOnOrderStatus: string;
  excludeShippingFromEarning: boolean;
  excludedProductIds: string[];
  pointValueMinor: number;
  maxRedemptionPercentOfSale: number;
  minimumPointsToRedeem: number;
  managerApprovalAboveMinor: number;
  /** Sprint "POS analytics + loyalty cards": a customer normally keeps one
   *  ACTIVE physical card at a time — set true to allow more (e.g. a
   *  household sharing an account). Off by default. */
  allowMultipleCardsPerCustomer: boolean;
};

/**
 * Configurable thresholds for the POS anomaly-detection panel
 * (`/admin/pos-analytics` → Alertes). Only covers signals computable from
 * data that genuinely exists today — refund/cancel-derived alerts are
 * deferred until those POS actions themselves are built (see
 * progress.md's POS-analytics entry).
 */
export type PosAlertSettings = {
  largeCashDifferenceMinor: number;
  excessiveDiscountPercent: number;
  repeatedDiscountCountThreshold: number;
  repeatedDiscountWindowHours: number;
  longOpenSessionHours: number;
  belowCostAlertEnabled: boolean;
};
