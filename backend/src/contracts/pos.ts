// Backend-only contract (not mirrored from frontend types/).

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
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewNote: string | null;
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

export type PosTerminal = {
  id: string;
  terminalCode: string;
  name: string;
  locationId: string;
  registerId: string | null;
  active: boolean;
  deviceFingerprint: string;
  pairingCode: string | null;
  lastSeenAt: string | null;
  lastIp: string | null;
  appVersion: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  createdAt: string;
};

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

export type PosSaleLineInput = {
  variantId: string;
  qty: number;
  discountMinor?: number;
};

export type PosPaymentMethod = 'CASH' | 'CARD' | 'MIXED' | 'OTHER';

/** One entry per method the cashier applied to the sale; amounts must sum
 *  to the sale's totalMinor. A single CASH+CARD split creates two rows. */
export type PosSalePaymentInput = {
  method: 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'OTHER';
  amountMinor: number;
};

export type CreatePosSaleInput = {
  lines: PosSaleLineInput[];
  customerId?: string | null;
  discountMinor?: number;
  payments: PosSalePaymentInput[];
  /** Physical cash handed over by the customer, for change calculation —
   *  only meaningful when a CASH row is present and may exceed that row's
   *  amountMinor (e.g. 50 DT handed over for a 45 DT cash portion). */
  cashTenderedMinor?: number | null;
  /** Loyalty points the customer wants to redeem against this sale. Both
   *  the points deduction and the resulting discount commit inside the
   *  same transaction as the rest of the sale — see LoyaltyLedgerService. */
  redeemPoints?: number;
  /** Required only when the redemption discount exceeds
   *  settings.loyalty.managerApprovalAboveMinor and the acting cashier
   *  lacks pos.apply_advanced_discount. */
  managerApproval?: { employeeId: string; password: string };
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

export type PosSaleStatus = 'SUSPENDED' | 'COMPLETED' | 'REFUNDED' | 'CANCELLED';

export type PosSale = {
  id: string;
  saleNumber: number;
  terminalId: string;
  registerId: string | null;
  cashierId: string;
  cashierName: string;
  sessionId: string;
  locationId: string;
  status: PosSaleStatus;
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
