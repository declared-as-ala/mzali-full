// Admin-only type for the new inventory feature (mzali-api provider only).
export type InventoryItem = {
  productId: string;
  productName: string;
  productSlug: string;
  imageUrl?: string | null;
  warehouseId: string;
  onHand: number;
  reserved: number;
  available: number;
  lowStockThreshold: number | null;
  boutiqueOnHand: number;
  boutiqueReserved: number;
  boutiqueAvailable: number;
  incomingPurchase: number;
  updatedAt: string;
};

export type StockMovement = {
  id: string;
  productId: string;
  warehouseId: string;
  type: 'migration_init' | 'manual_adjust' | 'order_reserve' | 'order_release' | 'order_commit' | 'correction'
    | 'pos_sale' | 'purchase_receipt' | 'return_restock' | 'refund_restock' | 'exchange_out' | 'exchange_in'
    | 'transfer_out' | 'transfer_in' | 'damage' | 'loss' | 'stocktake_correction' | 'supplier_return';
  qty: number;
  onHandAfter: number;
  reservedAfter: number;
  orderId: string | null;
  reason: string | null;
  actor: { type: string; id: string | null; name: string };
  createdAt: string;
};
