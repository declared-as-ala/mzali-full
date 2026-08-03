// Hand-kept in sync with backend/src/contracts/pos.ts (not enforced by
// check-contracts.mjs — same convention as the main frontend's types/inventory.ts).

export type PosCatalogItem = {
  productId: string;
  variantId: string;
  name: string;
  slug: string;
  sku: string;
  barcode: string | null;
  priceMinor: number;
  imageUrl: string | null;
  categoryIds: string[];
  boutiqueAvailable: number;
  depotAvailable: number;
  favorite: boolean;
};

export type PosCategory = { id: string; name: string; slug: string };

export type PosCatalogResponse = {
  items: PosCatalogItem[];
  categories: PosCategory[];
  generatedAt: string;
};

export type PosPaymentMethod = 'CASH' | 'CARD' | 'MIXED' | 'OTHER';

export type CartLine = {
  variantId: string;
  productId: string;
  name: string;
  sku: string;
  imageUrl: string | null;
  unitPriceMinor: number;
  qty: number;
  boutiqueAvailable: number;
};

export type PosSaleLine = {
  variantId: string;
  productId: string;
  descriptionSnapshot: string;
  sku: string;
  variantAttributesSnapshot?: Record<string, string>;
  qty: number;
  unitPriceMinor: number;
  discountMinor: number;
  lineTotalMinor: number;
};

export type PosSalePaymentInput = {
  method: 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'OTHER';
  amountMinor: number;
};

export type PosSale = {
  id: string;
  saleNumber: number;
  terminalId: string;
  registerId: string | null;
  cashierId: string;
  cashierName: string;
  sessionId: string;
  locationId: string;
  status: 'SUSPENDED' | 'COMPLETED' | 'REFUNDED' | 'CANCELLED';
  lines: PosSaleLine[];
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  merchant: {
    legalName: string;
    address: string;
    phone: string;
    matriculeFiscal: string;
    rcNumber: string;
  };
  subtotalMinor: number;
  discountMinor: number;
  totalMinor: number;
  paymentMethod: PosPaymentMethod | null;
  payments: PosSalePaymentInput[];
  cashReceivedMinor: number | null;
  changeMinor: number | null;
  loyaltyPointsEarned: number;
  loyaltyPointsRedeemed: number;
  loyaltyDiscountMinor: number;
  notes: string | null;
  createdAt: string;
  completedAt: string | null;
};

export type PosSalesListResponse = {
  items: PosSale[];
  total: number;
  page: number;
  perPage: number;
};

export type PosDashboardSummary = {
  grossRevenueMinor: number;
  ticketCount: number;
  avgBasketMinor: number;
  productsSoldQty: number;
  cashMinor: number;
  cardMinor: number;
  mixedMinor: number;
};

export type PosDashboardTopProduct = {
  rank: number;
  productId: string;
  variantId: string | null;
  name: string;
  sku: string | null;
  imageUrl: string | null;
  qtySold: number;
  revenueMinor: number;
  boutiqueStock: number;
};

export type PosCustomerSummary = {
  customerId: string;
  customerName: string | null;
  loyaltyAccount: LoyaltyAccount | null;
  totalSpentInStoreMinor: number;
  visitCount: number;
  lastVisitAt: string | null;
  purchaseHistory: { saleId: string; saleNumber: number; date: string; totalMinor: number; itemCount: number }[];
  favoriteProducts: { productId: string; name: string; qtyPurchased: number }[];
};

export type PosSuggestion = {
  productId: string;
  variantId: string;
  name: string;
  imageUrl: string | null;
  priceMinor: number;
  reason: 'frequently_bought_together' | 'best_seller' | 'similar';
};

export type PosSuggestionsResponse = {
  frequentlyBoughtTogether: PosSuggestion[];
  bestSellers: PosSuggestion[];
  similar: PosSuggestion[];
};

export type LoyaltyAccount = {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  cardNumber: string;
  pointsBalance: number;
  lifetimePointsEarned: number;
  lifetimePointsRedeemed: number;
  status: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED';
};

export type LoyaltyLookupResult = {
  customerId: string | null;
  customerName: string | null;
  account: LoyaltyAccount | null;
};

export type LoyaltyCardLookupResult = {
  found: boolean;
  card: { cardNumber: string; status: string; customerName: string | null } | null;
  account: LoyaltyAccount | null;
};

export type RedeemPreviewResult = {
  valid: boolean;
  discountMinor: number;
  requiresManagerApproval: boolean;
  error: string | null;
};

export type PosSessionStatus = 'OPEN' | 'CLOSED';

export type PosCashierSession = {
  id: string;
  cashierId: string;
  terminalId: string;
  registerId: string | null;
  openingCashMinor: number;
  openedAt: string;
  closedAt: string | null;
  closingCountedCashMinor: number | null;
  status: PosSessionStatus;
  grossSalesMinor: number;
  refundsMinor: number;
  discountsMinor: number;
  cashSalesMinor: number;
  cardSalesMinor: number;
  otherSalesMinor: number;
  cashMovementsAddMinor: number;
  cashMovementsRemoveMinor: number;
  transactionCount: number;
};

export type PosSessionReport = {
  type: 'X' | 'Z';
  generatedAt: string;
  expectedCashMinor: number;
  countedCashMinor: number | null;
  cashDifferenceMinor: number | null;
  flagged: boolean;
  grossSalesMinor: number;
  refundsMinor: number;
  discountsMinor: number;
  netSalesMinor: number;
  cashSalesMinor: number;
  cardSalesMinor: number;
  otherSalesMinor: number;
  cashMovementsAddMinor: number;
  cashMovementsRemoveMinor: number;
  transactionCount: number;
};
