// Backend-only contract (not mirrored from frontend types/).

export type LoyaltyAccountStatus = 'ACTIVE' | 'SUSPENDED' | 'EXPIRED';

export type LoyaltyAccount = {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  cardNumber: string;
  qrCodeValue: string;
  barcodeValue: string;
  pointsBalance: number;
  lifetimePointsEarned: number;
  lifetimePointsRedeemed: number;
  status: LoyaltyAccountStatus;
  joinedAt: string;
  lastActivityAt: string | null;
};

export type LoyaltyTransactionType =
  | 'EARN'
  | 'REDEEM'
  | 'REFUND_REVERSAL'
  | 'MANUAL_ADJUSTMENT'
  | 'BONUS'
  | 'EXPIRATION'
  | 'MIGRATION';

export type LoyaltyTransactionSourceType = 'POS_SALE' | 'ONLINE_ORDER' | 'REFUND' | 'MANUAL' | 'CAMPAIGN';

export type LoyaltyTransaction = {
  id: string;
  customerId: string;
  loyaltyAccountId: string;
  type: LoyaltyTransactionType;
  pointsDelta: number;
  balanceBefore: number;
  balanceAfter: number;
  sourceType: LoyaltyTransactionSourceType;
  sourceId: string | null;
  reason: string | null;
  performedBy: string | null;
  createdAt: string;
};

export type CreateLoyaltyAccountInput = {
  customerId?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
};

export type ManualLoyaltyAdjustmentInput = {
  accountId: string;
  pointsDelta: number;
  reason: string;
};

export type RedeemPreviewInput = {
  accountId: string;
  points: number;
  saleSubtotalMinor: number;
  managerApproval?: { employeeId: string; password: string };
};

export type RedeemPreviewResult = {
  valid: boolean;
  discountMinor: number;
  requiresManagerApproval: boolean;
  error: string | null;
};

// ---- Loyalty PVC cards ----

export type CardTemplateCode = 'STANDARD' | 'SILVER' | 'GOLD' | 'VIP';
export type CardBatchStatus = 'GENERATED' | 'EXPORTED' | 'PRINTED';
export type LoyaltyCardStatus = 'UNASSIGNED' | 'ACTIVE' | 'SUSPENDED' | 'LOST' | 'REPLACED' | 'REVOKED';

export type LoyaltyCardBatch = {
  id: string;
  batchNumber: number;
  name: string;
  quantity: number;
  templateCode: CardTemplateCode;
  templateVersion: number;
  generatedByName: string;
  generatedAt: string;
  exportedAt: string | null;
  printedAt: string | null;
  status: CardBatchStatus;
  notes: string | null;
  virtual: boolean;
  assignedCount: number;
  unassignedCount: number;
  revokedCount: number;
  otherCount: number;
};

export type CreateCardBatchInput = {
  name: string;
  quantity: number;
  templateCode: CardTemplateCode;
  notes?: string;
};

export type LoyaltyCardHistoryEntry = {
  event: string;
  at: string;
  byName: string;
  note: string | null;
};

export type LoyaltyCard = {
  id: string;
  cardNumber: string;
  qrToken: string;
  barcodeValue: string;
  batchId: string | null;
  batchName: string | null;
  templateCode: CardTemplateCode;
  status: LoyaltyCardStatus;
  accountId: string | null;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  assignedAt: string | null;
  replacesCardId: string | null;
  replacedByCardId: string | null;
  revokedAt: string | null;
  revokedReason: string | null;
  history: LoyaltyCardHistoryEntry[];
  createdAt: string;
};

export type AssignCardInput = {
  cardNumber?: string;
  qrToken?: string;
  customerId?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
};

export type ReplaceCardInput = {
  oldCardId: string;
  newCardNumber?: string;
  newQrToken?: string;
  reason: string;
};

export type CardLookupResult = {
  found: boolean;
  card: LoyaltyCard | null;
  account: LoyaltyAccount | null;
};
