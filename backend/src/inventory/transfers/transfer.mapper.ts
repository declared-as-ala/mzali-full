import type { StockTransfer as StockTransferContract } from '@contracts';
import { StockTransferDocument } from './stock-transfer.schema';

export function toTransferContract(doc: StockTransferDocument): StockTransferContract {
  return {
    id: doc.id,
    transferNumber: `TR-${String(doc.transferNumber).padStart(6, '0')}`,
    sourceLocationId: doc.sourceLocationId,
    destinationLocationId: doc.destinationLocationId,
    status: doc.status,
    lines: doc.lines.map((l) => ({
      variantId: l.variantId,
      productId: l.productId,
      productName: l.productName,
      requestedQuantity: l.requestedQuantity,
      approvedQuantity: l.approvedQuantity,
      shippedQuantity: l.shippedQuantity,
      receivedQuantity: l.receivedQuantity,
      damagedQuantity: l.damagedQuantity,
      missingQuantity: l.missingQuantity,
    })),
    statusHistory: doc.statusHistory.map((h) => ({
      from: h.from,
      to: h.to,
      by: h.by,
      at: h.at.toISOString(),
      note: h.note,
    })),
    requestedBy: doc.requestedBy,
    approvedBy: doc.approvedBy,
    note: doc.note,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
