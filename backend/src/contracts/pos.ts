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

/** Quantity-offer definition exposed to the POS — same shape/semantics as
 *  the storefront's Product.bundles, in minor units. Only bundles with
 *  quantity >= 2 are real quantity offers (see product-pricing.ts). */
export type PosProductBundle = {
  id: string;
  name: string;
  label: string | null;
  priceMinor: number;
  regularPriceMinor: number;
  quantity: number;
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
  /** This product's configured quantity offers (may be empty). The POS
   *  shows these in the "Offres disponibles" section and uses them purely
   *  for display — the server always recomputes and validates the final
   *  price at sale time (see PosSalesService.resolveSaleLines). */
  bundles: PosProductBundle[];
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
  /** Client-generated id shared by every line that together form one
   *  quantity-offer purchase of the same product (e.g. two lines for two
   *  different sizes bought under the same "2 for 45 DT" offer). The server
   *  sums every line sharing this id and re-prices the whole group with the
   *  best available combination of that product's configured offers — the
   *  client never sends a price or picks which offer applies. Omit for a
   *  plain line with no quantity offer. */
  bundleGroupId?: string;
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
  /** Immutable pricing snapshot — set only when a quantity offer applied to
   *  this line, so historical receipts stay correct even if the product's
   *  offers change or are removed later. `regularUnitPriceMinor` is always
   *  set (even with no offer applied) so the receipt can always show what
   *  the line would have cost at plain price. */
  bundleGroupId?: string | null;
  bundleId?: string | null;
  bundleName?: string | null;
  regularUnitPriceMinor?: number | null;
};

/** Live pricing preview for the cart-in-progress — same resolveSaleLines()
 *  logic create() uses, with no stock/session side effects. Lets the POS
 *  screen show the authoritative offer-adjusted total as the cashier edits
 *  the cart, without duplicating any pricing math in the frontend. */
export type QuotePosSaleInput = { lines: PosSaleLineInput[] };
export type PosSaleQuote = { lines: PosSaleLine[]; subtotalMinor: number };

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
  /** Sale completion and receipt printing are independent — a printer
   *  jam/offline printer must never cancel or duplicate an already-saved
   *  sale. 'pending' until the local hardware bridge confirms the print
   *  (or reports a failure the cashier can retry from history). */
  printStatus: PosPrintStatus;
  printedAt: string | null;
};

export type PosPrintStatus = 'pending' | 'printed' | 'failed';

/** Per-terminal receipt-printer configuration — persisted server-side (not
 *  just in the browser) so it survives a browser restart, a fresh login, or
 *  a token refresh, and follows "this physical till" rather than "whoever
 *  is currently logged in". */
export type PosPrinterSettings = {
  printerName: string | null;
  paperWidthMm: 58 | 80;
  printCopies: number;
  autoPrint: boolean;
  autoOpenDrawer: boolean;
  printLogo: boolean;
  printQr: boolean;
};

export type UpdatePosPrinterSettingsInput = Partial<PosPrinterSettings>;
