// Backend-only contract (not mirrored from frontend types/).

export type InventoryItem = {
  productId: string;
  productName: string;
  productSlug: string;
  imageUrl?: string | null;
  warehouseId: string;           // 'DEPOT' — kept for backward compatibility
  onHand: number;
  reserved: number;
  available: number;             // onHand - reserved
  lowStockThreshold: number | null;
  /** BOUTIQUE-side numbers, populated by Sprint 5 transfers — 0 until a transfer ever lands stock there. */
  boutiqueOnHand: number;
  boutiqueReserved: number;
  boutiqueAvailable: number;
  /** Sum of open (SUBMITTED/CONFIRMED_BY_SUPPLIER/PARTIALLY_RECEIVED) POs' remaining orderedQuantity - receivedQuantity. */
  incomingPurchase: number;
  updatedAt: string;
};

export type StockMovementType =
  | 'migration_init'
  | 'manual_adjust'
  | 'order_reserve'
  | 'order_release'
  | 'order_commit'
  | 'correction'
  | 'pos_sale'
  | 'purchase_receipt'
  | 'return_restock'
  | 'refund_restock'
  | 'exchange_out'
  | 'exchange_in'
  | 'transfer_out'
  | 'transfer_in'
  | 'damage'
  | 'loss'
  | 'stocktake_correction'
  | 'supplier_return';

export type StockMovement = {
  id: string;
  productId: string;
  warehouseId: string;
  type: StockMovementType;
  qty: number;                   // signed delta applied to onHand or reserved
  onHandAfter: number;
  reservedAfter: number;
  orderId: string | null;
  reason: string | null;
  actor: { type: 'system' | 'employee' | 'migration'; id: string | null; name: string };
  createdAt: string;
};

export type StockAlert = {
  id: string;
  type: 'low_stock' | 'out_of_stock';
  variantId: string;
  locationId: string;
  productId: string;
  productName: string;
  available: number;
  threshold: number;
  negativeStock: boolean;
  createdAt: string;
  updatedAt: string;
};

export type StockAdjustInput = {
  productId: string;
  qty: number;                   // signed delta to onHand
  reason: string;
};

export type TransferStatus =
  | 'DRAFT' | 'REQUESTED' | 'APPROVED' | 'PREPARING' | 'SHIPPED'
  | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED' | 'REJECTED';

export type TransferActor = { type: 'system' | 'employee' | 'migration' | 'service'; id: string | null; name: string };

export type TransferLine = {
  variantId: string;
  productId: string;
  productName: string;
  requestedQuantity: number;
  approvedQuantity: number | null;
  shippedQuantity: number | null;
  receivedQuantity: number;
  damagedQuantity: number;
  missingQuantity: number;
};

export type StockTransfer = {
  id: string;
  transferNumber: string; // formatted "TR-000123"
  sourceLocationId: string;
  destinationLocationId: string;
  status: TransferStatus;
  lines: TransferLine[];
  statusHistory: { from: string | null; to: string; by: TransferActor; at: string; note: string | null }[];
  requestedBy: TransferActor;
  approvedBy: TransferActor | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StocktakeStatus = 'DRAFT' | 'IN_PROGRESS' | 'COUNTED' | 'REVIEW_REQUIRED' | 'APPROVED' | 'POSTED' | 'CANCELLED';

export type StocktakeLine = {
  variantId: string;
  productId: string;
  productName: string;
  /** Omitted from the API response entirely when the stocktake is blindCount — see StocktakesService.toContract. */
  expectedQuantity?: number;
  countedQuantity: number | null;
  difference: number | null;
  reasonIfLarge: string | null;
};

export type Stocktake = {
  id: string;
  stocktakeNumber: string; // formatted "INV-000123"
  locationId: string;
  status: StocktakeStatus;
  scope: { kind: 'all' | 'categories'; categoryIds: string[] };
  blindCount: boolean;
  lines: StocktakeLine[];
  startedBy: TransferActor;
  approvedBy: TransferActor | null;
  postedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
